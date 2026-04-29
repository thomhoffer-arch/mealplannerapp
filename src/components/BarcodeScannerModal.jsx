import React, { useEffect, useRef, useState } from 'react';
import { X, Check, AlertCircle, Package, ScanLine } from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/browser';

const OFF_URL = (code) =>
  `https://world.openfoodfacts.org/api/v2/product/${code}?fields=product_name,product_name_en,generic_name,quantity,product_quantity`;

function getProductName(p) {
  return p?.product_name_en || p?.product_name || p?.generic_name || null;
}

function parseAmount(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|oz|lb|cl)\b/i);
  if (!m) return null;
  const val = parseFloat(m[1].replace(',', '.'));
  const unit = m[2].toLowerCase();
  const W = { g: 1, kg: 1000, oz: 28.35, lb: 453.6 };
  const V = { ml: 1, l: 1000, cl: 10 };
  if (W[unit]) return { type: 'weight', grams: val * W[unit] };
  if (V[unit]) return { type: 'volume', ml: val * V[unit] };
  return null;
}

function formatRemainder(prod, needed) {
  if (!prod || !needed || prod.type !== needed.type) return null;
  const k = prod.type === 'weight' ? 'grams' : 'ml';
  const rem = prod[k] - needed[k];
  if (rem <= 0) return null;
  const u = prod.type === 'weight' ? 'g' : 'ml';
  return rem >= 1000
    ? `${(rem / 1000).toFixed(1).replace('.0', '')} ${prod.type === 'weight' ? 'kg' : 'l'}`
    : `${Math.round(rem)} ${u}`;
}

function matchToItem(productName, items) {
  const pn = productName.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const pnWords = pn.split(' ').filter((w) => w.length > 2);
  let best = null, bestScore = 0;
  for (const item of items) {
    const base = item.name.toLowerCase().replace(/,.*$/, '').trim();
    const bw = base.split(/\s+/).filter((w) => w.length > 2);
    if (!bw.length) continue;
    const hit = bw.filter((w) => pnWords.some((pw) => pw === w || pw.startsWith(w) || w.startsWith(pw)));
    if (hit.length === bw.length && bw.length > bestScore) { bestScore = bw.length; best = item; }
  }
  return best;
}

export default function BarcodeScannerModal({ shoppingItems, checkedItems, onCheckOff, onAddToPantry, onClose }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
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

  const [phase, setPhase] = useState('init'); // init | scanning | checking | no_match | error
  const [cameraError, setCameraError] = useState(null);
  const [flashItem, setFlashItem] = useState(null);
  const [noMatchLabel, setNoMatchLabel] = useState(null);

  useEffect(() => {
    const codeReader = new BrowserMultiFormatReader();

    async function handleBarcode(barcodeValue) {
      if (cancelledRef.current) return;
      setPhase('checking');
      setFlashItem(null);
      setNoMatchLabel(null);

      let productName = null, productQuantityStr = null, productQuantityG = null;
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 6000);
        const res = await fetch(OFF_URL(barcodeValue), { signal: ctrl.signal });
        clearTimeout(tid);
        const json = await res.json();
        if (json.status === 1) {
          productName = getProductName(json.product);
          productQuantityStr = json.product?.quantity || null;
          productQuantityG = json.product?.product_quantity != null ? parseFloat(json.product.product_quantity) : null;
        }
      } catch {}

      if (cancelledRef.current) return;

      const unchecked = shoppingItemsRef.current.filter((i) => !checkedItemsRef.current[i.name] && !i.inPantry);
      const matched = productName ? matchToItem(productName, unchecked) : null;

      let pantryRemainder = null;
      if (matched?.amount) {
        const needed = parseAmount(matched.amount);
        const prod = productQuantityG ? { type: 'weight', grams: productQuantityG } : parseAmount(productQuantityStr);
        const rem = formatRemainder(prod, needed);
        if (rem) pantryRemainder = { name: matched.name, amount: rem };
      }

      if (matched) {
        onCheckOffRef.current(matched.name);
        if (pantryRemainder) onAddToPantryRef.current(pantryRemainder.name, pantryRemainder.amount);
        setFlashItem({ name: matched.name, pantryRemainder });
        setPhase('scanning');
        setTimeout(() => {
          const el = listRef.current?.querySelector(`[data-item="${CSS.escape(matched.name)}"]`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
      } else {
        setNoMatchLabel(productName || barcodeValue);
        setPhase('no_match');
      }

      setTimeout(() => {
        if (cancelledRef.current) return;
        coolingRef.current = false;
        setFlashItem(null);
        setNoMatchLabel(null);
        setPhase('scanning');
      }, 2500);
    }

    (async () => {
      try {
        controlsRef.current = await codeReader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
          videoRef.current,
          (result) => {
            if (!result || coolingRef.current || cancelledRef.current) return;
            coolingRef.current = true;
            handleBarcode(result.getText());
          }
        );
        if (!cancelledRef.current) setPhase('scanning');
      } catch (err) {
        if (!cancelledRef.current) {
          setCameraError(err.name === 'NotAllowedError'
            ? 'Camera access denied. Allow camera in browser settings and try again.'
            : 'Could not open camera.');
          setPhase('error');
        }
      }
    })();

    return () => {
      cancelledRef.current = true;
      controlsRef.current?.stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() {
    cancelledRef.current = true;
    controlsRef.current?.stop();
    onClose();
  }

  const uncheckedItems = shoppingItems.filter((i) => !checkedItems[i.name] && !i.inPantry).sort((a, b) => a.name.localeCompare(b.name));
  const checkedOffItems = shoppingItems.filter((i) => checkedItems[i.name] && !i.inPantry).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">

      {/* ── Compact camera bar ────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-3 py-2 bg-orange-900 flex-shrink-0">
        {/* Tiny camera preview */}
        <div className="relative flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden bg-black">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          {/* Viewfinder lines */}
          {(phase === 'scanning' || phase === 'checking') && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {['top-0 left-0 border-t border-l','top-0 right-0 border-t border-r',
                'bottom-0 left-0 border-b border-l','bottom-0 right-0 border-b border-r'].map((cls, i) => (
                <div key={i} className={`absolute w-2.5 h-2.5 border-orange-400 ${cls}`} />
              ))}
            </div>
          )}
        </div>

        {/* Status text */}
        <div className="flex-1 min-w-0">
          {phase === 'init' && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 border-2 border-orange-300/40 border-t-orange-300 rounded-full animate-spin flex-shrink-0" />
              <span className="text-xs text-orange-300">Starting camera…</span>
            </div>
          )}
          {phase === 'scanning' && (
            <div className="flex items-center gap-1.5">
              <ScanLine size={13} className="text-orange-400 flex-shrink-0" />
              <span className="text-xs text-orange-200">Scanning — point at a barcode</span>
            </div>
          )}
          {phase === 'checking' && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 border-2 border-orange-300/40 border-t-orange-300 rounded-full animate-spin flex-shrink-0" />
              <span className="text-xs text-orange-200">Looking up product…</span>
            </div>
          )}
          {phase === 'no_match' && noMatchLabel && (
            <div className="flex items-center gap-1.5">
              <AlertCircle size={13} className="text-orange-400 flex-shrink-0" />
              <span className="text-xs text-orange-300 truncate">Not on list: {noMatchLabel}</span>
            </div>
          )}
          {phase === 'error' && (
            <span className="text-xs text-red-300">{cameraError}</span>
          )}
        </div>

        <button onClick={handleClose}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-orange-300 hover:text-white transition rounded-full hover:bg-white/10">
          <X size={18} />
        </button>
      </div>

      {/* Pantry remainder banner */}
      {flashItem?.pantryRemainder && (
        <div className="flex items-center gap-2 bg-orange-50 border-b border-orange-100 px-4 py-2 flex-shrink-0">
          <Package size={13} className="text-orange-400 flex-shrink-0" />
          <p className="text-xs text-orange-600">
            <span className="font-medium">{flashItem.pantryRemainder.amount}</span> of {flashItem.pantryRemainder.name} left over — added to pantry
          </p>
        </div>
      )}

      {/* ── Shopping list (fills remaining space) ─────────────────────── */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {uncheckedItems.length === 0 && checkedOffItems.length === 0 && (
          <p className="text-center text-orange-400 text-sm py-10">Your shopping list is empty</p>
        )}

        {uncheckedItems.map((item) => {
          const flash = flashItem?.name === item.name;
          return (
            <div key={item.name} data-item={item.name}
              className={`flex items-center gap-3 px-4 py-3.5 border-b border-orange-50 transition-colors duration-500 ${flash ? 'bg-sage-50' : 'bg-white'}`}>
              <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${flash ? 'bg-sage-500 border-sage-500' : 'border-orange-300'}`}>
                {flash && <Check size={13} className="text-white" />}
              </div>
              <span className={`text-sm capitalize flex-1 transition-all duration-300 ${flash ? 'line-through text-orange-400' : 'text-orange-900 font-medium'}`}>
                {item.name}
              </span>
              {item.amount && <span className="text-xs text-orange-400 flex-shrink-0">{item.amount}</span>}
            </div>
          );
        })}

        {checkedOffItems.length > 0 && (
          <>
            <p className="text-[11px] font-semibold text-orange-300 uppercase tracking-wide px-4 pt-4 pb-2">In the basket</p>
            {checkedOffItems.map((item) => (
              <div key={item.name} data-item={item.name}
                className="flex items-center gap-3 px-4 py-3 border-b border-orange-50 opacity-40">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 border-2 border-orange-200 flex items-center justify-center">
                  <Check size={13} className="text-orange-400" />
                </div>
                <span className="text-sm capitalize line-through text-orange-400 flex-1">{item.name}</span>
                {item.amount && <span className="text-xs text-orange-300 flex-shrink-0">{item.amount}</span>}
              </div>
            ))}
          </>
        )}

        <div className="h-6" />
      </div>
    </div>
  );
}
