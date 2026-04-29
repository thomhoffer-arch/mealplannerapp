import React, { useEffect, useRef, useState } from 'react';
import { X, CheckCircle, AlertCircle, Package } from 'lucide-react';

const OFF_URL = (code) =>
  `https://world.openfoodfacts.org/api/v2/product/${code}?fields=product_name,product_name_en,generic_name,quantity,product_quantity,product_quantity_unit`;

function getProductName(product) {
  return product?.product_name_en || product?.product_name || product?.generic_name || null;
}

// Parse an amount string like "200 g", "1.5 kg", "500 ml", "2 tbsp" into { grams, unit }.
// Returns null if unparseable. Normalizes weight to grams, volume to ml.
function parseAmount(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|oz|lb|cl|fl\.?\s*oz\.?)\b/i);
  if (!m) return null;
  const val = parseFloat(m[1].replace(',', '.'));
  const unit = m[2].replace(/\s|\./, '').toLowerCase();
  const WEIGHT = { g: 1, kg: 1000, oz: 28.35, lb: 453.6 };
  const VOLUME = { ml: 1, l: 1000, cl: 10, floz: 29.57 };
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

// Match a product name against unchecked shopping items.
// Returns the best matching item or null.
function matchProductToItem(productName, items) {
  const pn = productName.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const pnWords = pn.split(' ').filter((w) => w.length > 2);

  let bestItem = null;
  let bestScore = 0;

  for (const item of items) {
    const base = item.name.toLowerCase().replace(/,.*$/, '').trim();
    const baseWords = base.split(/\s+/).filter((w) => w.length > 2);
    if (baseWords.length === 0) continue;

    // Every word in the ingredient base must appear in the product name
    const matched = baseWords.filter((w) => pnWords.some((pw) => pw === w || pw.startsWith(w) || w.startsWith(pw)));
    if (matched.length === baseWords.length) {
      // Longer base = more specific match = higher priority
      if (baseWords.length > bestScore) {
        bestScore = baseWords.length;
        bestItem = item;
      }
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

  // Keep latest props in refs so the scan loop always reads fresh values without restarting
  const shoppingItemsRef = useRef(shoppingItems);
  const checkedItemsRef = useRef(checkedItems);
  const onCheckOffRef = useRef(onCheckOff);
  const onAddToPantryRef = useRef(onAddToPantry);
  useEffect(() => { shoppingItemsRef.current = shoppingItems; }, [shoppingItems]);
  useEffect(() => { checkedItemsRef.current = checkedItems; }, [checkedItems]);
  useEffect(() => { onCheckOffRef.current = onCheckOff; }, [onCheckOff]);
  useEffect(() => { onAddToPantryRef.current = onAddToPantry; }, [onAddToPantry]);

  const [phase, setPhase] = useState('init'); // init | scanning | checking | matched | no_match | error
  const [cameraError, setCameraError] = useState(null);
  const [result, setResult] = useState(null);

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

      let productName = null;
      let productQuantityStr = null; // e.g. "200 g"
      let productQuantityG = null;   // numeric grams from OFF

      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(OFF_URL(barcode), { signal: controller.signal });
        clearTimeout(tid);
        const json = await res.json();
        if (json.status === 1) {
          const p = json.product;
          productName = getProductName(p);
          productQuantityStr = p?.quantity || null;        // "200 g", "1 l", etc.
          productQuantityG = p?.product_quantity != null ? parseFloat(p.product_quantity) : null;
          // product_quantity is in grams by default in OFF
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
        // Try product_quantity (OFF gives grams) first, fall back to quantity string
        const parsedProduct = productQuantityG
          ? { type: 'weight', grams: productQuantityG }
          : parseAmount(productQuantityStr);
        const remainderStr = formatRemainder(parsedProduct, parsedNeeded);
        if (remainderStr) {
          pantryRemainder = { name: matchedItem.name, amount: remainderStr };
        }
      }

      if (matchedItem) {
        onCheckOffRef.current(matchedItem.name);
        if (pantryRemainder) {
          onAddToPantryRef.current(pantryRemainder.name, pantryRemainder.amount);
        }
        setResult({ productName, item: matchedItem, barcode, pantryRemainder });
        setPhase('matched');
      } else {
        setResult({ productName, item: null, barcode, pantryRemainder: null });
        setPhase('no_match');
      }

      setTimeout(() => {
        if (cancelledRef.current) return;
        coolingRef.current = false;
        setPhase('scanning');
        rafRef.current = requestAnimationFrame(scan);
      }, 3000);
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
              ? 'Camera access denied. Please allow camera in your browser settings and try again.'
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

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Camera feed */}
      <div className="relative flex-1 overflow-hidden">
        {supported && (
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
        )}

        {/* Viewfinder overlay — dim everything outside the scan zone */}
        {(phase === 'scanning' || phase === 'checking') && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-72 h-44">
              <div className="absolute inset-0 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] rounded-xl" />
              {[
                'top-0 left-0 border-t-2 border-l-2 rounded-tl-md',
                'top-0 right-0 border-t-2 border-r-2 rounded-tr-md',
                'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-md',
                'bottom-0 right-0 border-b-2 border-r-2 rounded-br-md',
              ].map((cls, i) => (
                <div key={i} className={`absolute w-6 h-6 border-orange-400 ${cls}`} />
              ))}
              {phase === 'checking' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-orange-300 border-t-orange-500 rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>
        )}

        <button onClick={handleClose}
          className="absolute top-4 right-4 w-10 h-10 bg-black/40 backdrop-blur-sm text-white rounded-full flex items-center justify-center">
          <X size={20} />
        </button>

        {!supported && (
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <div className="bg-white rounded-2xl p-6 text-center max-w-xs shadow-lg">
              <p className="font-semibold text-orange-900 mb-2">Scanner not available</p>
              <p className="text-sm text-orange-500">Barcode scanning requires Chrome or Edge. Try updating your browser or use a different device.</p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom status panel */}
      <div className="bg-white px-6 pt-5 pb-8 min-h-[140px] flex flex-col justify-center">
        {phase === 'init' && (
          <div className="flex items-center justify-center gap-2 text-orange-400">
            <div className="w-4 h-4 border-2 border-orange-200 border-t-orange-400 rounded-full animate-spin" />
            <span className="text-sm">Starting camera…</span>
          </div>
        )}

        {phase === 'scanning' && (
          <div className="text-center">
            <p className="font-semibold text-orange-900 mb-1">Point at a barcode</p>
            <p className="text-xs text-orange-400">Items on your list are checked off automatically</p>
          </div>
        )}

        {phase === 'checking' && (
          <div className="flex items-center justify-center gap-2 text-orange-500">
            <div className="w-4 h-4 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
            <span className="text-sm">Looking up product…</span>
          </div>
        )}

        {phase === 'matched' && result && (
          <div>
            <div className="flex items-start gap-3 mb-2">
              <CheckCircle size={22} className="text-sage-500 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                {result.productName && (
                  <p className="text-xs text-orange-400 truncate">{result.productName}</p>
                )}
                <p className="font-semibold text-orange-900 capitalize">{result.item.name} checked off</p>
              </div>
            </div>
            {result.pantryRemainder && (
              <div className="flex items-center gap-2 bg-orange-50 rounded-xl px-3 py-2 mb-2">
                <Package size={14} className="text-orange-400 flex-shrink-0" />
                <p className="text-xs text-orange-600">
                  <span className="font-medium">{result.pantryRemainder.amount}</span> of {result.pantryRemainder.name} left over — added to your pantry
                </p>
              </div>
            )}
            <p className="text-xs text-orange-300 text-center">Ready for next item…</p>
          </div>
        )}

        {phase === 'no_match' && result && (
          <div>
            <div className="flex items-start gap-3 mb-2">
              <AlertCircle size={22} className="text-orange-300 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs text-orange-300 truncate">
                  {result.productName || `Code: ${result.barcode}`}
                </p>
                <p className="font-semibold text-orange-700">Not on your list</p>
              </div>
            </div>
            <p className="text-xs text-orange-300 text-center">Ready for next item…</p>
          </div>
        )}

        {phase === 'error' && (
          <p className="text-center text-sm text-red-400">{cameraError}</p>
        )}
      </div>
    </div>
  );
}
