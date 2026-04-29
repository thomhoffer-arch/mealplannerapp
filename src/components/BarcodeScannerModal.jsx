import React, { useEffect, useRef, useState } from 'react';
import { X, Check, AlertCircle, Package } from 'lucide-react';

const OFF_URL = (code) =>
  `https://world.openfoodfacts.org/api/v2/product/${code}?fields=product_name,product_name_en,generic_name,quantity,product_quantity`;

function getProductName(product) {
  return product?.product_name_en || product?.product_name || product?.generic_name || null;
}

function parseAmount(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|oz|lb|cl)\b/i);
  if (!m) return null;
  const val = parseFloat(m[1].replace(',', '.'));
  const unit = m[2].toLowerCase();
  const WEIGHT = { g: 1, kg: 1000, oz: 28.35, lb: 453.6 };
  const VOLUME = { ml: 1, l: 1000, cl: 10 };
  if (WEIGHT[unit] != null) return { type: 'weight', grams: val * WEIGHT[unit] };
  if (VOLUME[unit] != null) return { type: 'volume', ml: val * VOLUME[unit] };
  return null;
}

function formatRemainder(parsedProduct, parsedNeeded) {
  if (!parsedProduct || !parsedNeeded || parsedProduct.type !== parsedNeeded.type) return null;
  const key = parsedProduct.type === 'weight' ? 'grams' : 'ml';
  const remainder = parsedProduct[key] - parsedNeeded[key];
  if (remainder <= 0) return null;
  const unit = parsedProduct.type === 'weight' ? 'g' : 'ml';
  return remainder >= 1000
    ? `${(remainder / 1000).toFixed(1).replace('.0', '')} ${parsedProduct.type === 'weight' ? 'kg' : 'l'}`
    : `${Math.round(remainder)} ${unit}`;
}

function matchProductToItem(productName, items) {
  const pn = productName.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const pnWords = pn.split(' ').filter((w) => w.length > 2);
  let bestItem = null;
  let bestScore = 0;
  for (const item of items) {
    const base = item.name.toLowerCase().replace(/,.*$/, '').trim();
    const baseWords = base.split(/\s+/).filter((w) => w.length > 2);
    if (baseWords.length === 0) continue;
    const matched = baseWords.filter((w) => pnWords.some((pw) => pw === w || pw.startsWith(w) || w.startsWith(pw)));
    if (matched.length === baseWords.length && baseWords.length > bestScore) {
      bestScore = baseWords.length;
      bestItem = item;
    }
  }
  return bestItem;
}

export default function BarcodeScannerModal({ shoppingItems, checkedItems, onCheckOff, onAddToPantry, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const rafRef = useRef(null);
  const coolingRef = useRef(false);
  const cancelledRef = useRef(false);
  const listRef = useRef(null);

  const shoppingItemsRef = useRef(shoppingItems);
  const checkedItemsRef = useRef(checkedItems);
  const onCheckOffRef = useRef(onCheckOff);
  const onAddToPantryRef = useRef(onAddToPantry);
  useEffect(() => { shoppingItemsRef.current = shoppingItems; }, [shoppingItems]);
  useEffect(() => { checkedItemsRef.current = checkedItems; }, [checkedItems]);
  useEffect(() => { onCheckOffRef.current = onCheckOff; }, [onCheckOff]);
  useEffect(() => { onAddToPantryRef.current = onAddToPantry; }, [onAddToPantry]);

  const [phase, setPhase] = useState('init');
  const [cameraError, setCameraError] = useState(null);
  // Track the most recently scanned item for the flash highlight
  const [flashItem, setFlashItem] = useState(null); // { name, pantryRemainder }
  const [noMatchName, setNoMatchName] = useState(null);

  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  useEffect(() => {
    if (!supported) return;

    async function scan() {
      if (cancelledRef.current) return;
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector || video.readyState < 2 || coolingRef.current) {
        rafRef.current = requestAnimationFrame(scan);
        return;
      }
      try {
        const codes = await detector.detect(video);
        if (codes.length > 0 && !coolingRef.current) {
          coolingRef.current = true;
          handleBarcode(codes[0].rawValue, scan);
          return;
        }
      } catch {}
      rafRef.current = requestAnimationFrame(scan);
    }

    async function handleBarcode(barcode, scan) {
      if (cancelledRef.current) return;
      setPhase('checking');
      setFlashItem(null);
      setNoMatchName(null);

      let productName = null;
      let productQuantityStr = null;
      let productQuantityG = null;

      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(OFF_URL(barcode), { signal: controller.signal });
        clearTimeout(tid);
        const json = await res.json();
        if (json.status === 1) {
          const p = json.product;
          productName = getProductName(p);
          productQuantityStr = p?.quantity || null;
          productQuantityG = p?.product_quantity != null ? parseFloat(p.product_quantity) : null;
        }
      } catch {}

      if (cancelledRef.current) return;

      const unchecked = shoppingItemsRef.current.filter(
        (i) => !checkedItemsRef.current[i.name] && !i.inPantry
      );
      const matchedItem = productName ? matchProductToItem(productName, unchecked) : null;

      let pantryRemainder = null;
      if (matchedItem?.amount) {
        const parsedNeeded = parseAmount(matchedItem.amount);
        const parsedProduct = productQuantityG
          ? { type: 'weight', grams: productQuantityG }
          : parseAmount(productQuantityStr);
        const remainderStr = formatRemainder(parsedProduct, parsedNeeded);
        if (remainderStr) pantryRemainder = { name: matchedItem.name, amount: remainderStr };
      }

      if (matchedItem) {
        onCheckOffRef.current(matchedItem.name);
        if (pantryRemainder) onAddToPantryRef.current(pantryRemainder.name, pantryRemainder.amount);
        setFlashItem({ name: matchedItem.name, pantryRemainder });
        setPhase('scanning');
        // Scroll the matched item into view after a tick
        setTimeout(() => {
          const el = listRef.current?.querySelector(`[data-item="${CSS.escape(matchedItem.name)}"]`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
      } else {
        setNoMatchName(productName || barcode);
        setPhase('no_match');
      }

      setTimeout(() => {
        if (cancelledRef.current) return;
        coolingRef.current = false;
        setFlashItem(null);
        setNoMatchName(null);
        setPhase('scanning');
        rafRef.current = requestAnimationFrame(scan);
      }, 2500);
    }

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelledRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        detectorRef.current = new BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'],
        });
        if (!cancelledRef.current) {
          setPhase('scanning');
          rafRef.current = requestAnimationFrame(scan);
        }
      } catch (err) {
        if (!cancelledRef.current) {
          setCameraError(
            err.name === 'NotAllowedError'
              ? 'Camera access denied. Please allow camera in your browser settings.'
              : 'Could not open camera. Try a different browser or device.'
          );
          setPhase('error');
        }
      }
    })();

    return () => {
      cancelledRef.current = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() {
    cancelledRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onClose();
  }

  // Items to show in the list — unchecked first, then checked (greyed)
  const uncheckedItems = shoppingItems.filter((i) => !checkedItems[i.name] && !i.inPantry).sort((a, b) => a.name.localeCompare(b.name));
  const checkedOffItems = shoppingItems.filter((i) => checkedItems[i.name] && !i.inPantry).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">

      {/* ── TOP: Camera (fixed height ~45%) ─────────────────────────── */}
      <div className="relative bg-black" style={{ height: '45dvh', flexShrink: 0 }}>
        {supported && (
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
        )}

        {/* Dim + viewfinder corners */}
        {(phase === 'scanning' || phase === 'checking') && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-64 h-36">
              <div className="absolute inset-0 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] rounded-lg" />
              {[
                'top-0 left-0 border-t-2 border-l-2 rounded-tl',
                'top-0 right-0 border-t-2 border-r-2 rounded-tr',
                'bottom-0 left-0 border-b-2 border-l-2 rounded-bl',
                'bottom-0 right-0 border-b-2 border-r-2 rounded-br',
              ].map((cls, i) => (
                <div key={i} className={`absolute w-5 h-5 border-orange-400 ${cls}`} />
              ))}
              {phase === 'checking' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-orange-300 border-t-orange-400 rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Status pill at bottom of camera */}
        <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
          {phase === 'init' && (
            <div className="flex items-center gap-2 bg-black/60 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full">
              <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Starting camera…
            </div>
          )}
          {phase === 'scanning' && (
            <div className="bg-black/50 backdrop-blur-sm text-white/80 text-xs px-3 py-1.5 rounded-full">
              Point at a barcode
            </div>
          )}
          {phase === 'checking' && (
            <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full">
              <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Looking up…
            </div>
          )}
          {phase === 'no_match' && noMatchName && (
            <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur-sm text-orange-300 text-xs px-3 py-1.5 rounded-full max-w-[80%]">
              <AlertCircle size={12} className="flex-shrink-0" />
              <span className="truncate">Not on list: {noMatchName}</span>
            </div>
          )}
          {phase === 'error' && (
            <div className="bg-red-900/80 text-red-200 text-xs px-3 py-1.5 rounded-full text-center max-w-[85%]">
              {cameraError}
            </div>
          )}
        </div>

        {/* Close button */}
        <button onClick={handleClose}
          className="absolute top-3 right-3 w-9 h-9 bg-black/40 backdrop-blur-sm text-white rounded-full flex items-center justify-center">
          <X size={18} />
        </button>

        {!supported && (
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <div className="bg-white rounded-2xl p-5 text-center max-w-xs shadow-lg">
              <p className="font-semibold text-orange-900 mb-2">Scanner not available</p>
              <p className="text-sm text-orange-500">Barcode scanning requires Chrome or Edge. Try updating your browser or switch device.</p>
            </div>
          </div>
        )}
      </div>

      {/* Pantry remainder banner (shown briefly after a match with leftover) */}
      {flashItem?.pantryRemainder && (
        <div className="flex items-center gap-2 bg-orange-50 border-b border-orange-100 px-4 py-2">
          <Package size={13} className="text-orange-400 flex-shrink-0" />
          <p className="text-xs text-orange-600">
            <span className="font-medium">{flashItem.pantryRemainder.amount}</span> of {flashItem.pantryRemainder.name} left over — added to pantry
          </p>
        </div>
      )}

      {/* ── BOTTOM: Shopping list ────────────────────────────────────── */}
      <div ref={listRef} className="flex-1 overflow-y-auto bg-white">
        {uncheckedItems.length === 0 && checkedOffItems.length === 0 && (
          <p className="text-center text-orange-400 text-sm py-8">Your shopping list is empty</p>
        )}

        {uncheckedItems.map((item) => {
          const isFlashing = flashItem?.name === item.name;
          return (
            <div key={item.name}
              data-item={item.name}
              className={`flex items-center gap-3 px-4 py-3.5 border-b border-orange-50 transition-colors duration-500 ${isFlashing ? 'bg-sage-50' : 'bg-white'}`}>
              <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${isFlashing ? 'bg-sage-500 border-sage-500' : 'border-orange-300'}`}>
                {isFlashing && <Check size={13} className="text-white" />}
              </div>
              <span className={`text-sm capitalize transition-all duration-300 ${isFlashing ? 'line-through text-orange-400' : 'text-orange-900 font-medium'}`}>
                {item.name}
              </span>
              {item.amount && (
                <span className="ml-auto text-xs text-orange-400 flex-shrink-0">{item.amount}</span>
              )}
            </div>
          );
        })}

        {checkedOffItems.length > 0 && (
          <>
            <p className="text-[11px] font-semibold text-orange-300 uppercase tracking-wide px-4 pt-4 pb-2">In the basket</p>
            {checkedOffItems.map((item) => (
              <div key={item.name}
                data-item={item.name}
                className="flex items-center gap-3 px-4 py-3 border-b border-orange-50 bg-white opacity-50">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 border-2 border-orange-200 flex items-center justify-center">
                  <Check size={13} className="text-orange-400" />
                </div>
                <span className="text-sm capitalize line-through text-orange-400">{item.name}</span>
                {item.amount && (
                  <span className="ml-auto text-xs text-orange-300 flex-shrink-0">{item.amount}</span>
                )}
              </div>
            ))}
          </>
        )}

        <div className="h-6" />
      </div>
    </div>
  );
}
