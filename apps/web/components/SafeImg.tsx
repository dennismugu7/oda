'use client';

// A plain <img> (decision #59) that disappears when its file doesn't load, so the tile's own
// background (the beige placeholder) shows instead of a broken image. Photos live in storage,
// which can stop answering (Vercel Blob at a Hobby limit, decision #93 D1); the page around
// them never waits for it. A file that failed before the page became interactive is caught
// on mount too.
import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';

export function SafeImg(props: ImgHTMLAttributes<HTMLImageElement>) {
  const ref = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, [props.src]);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- plain images (decision #59); alt comes from props
    <img
      {...props}
      ref={ref}
      onError={(e) => {
        setFailed(true);
        props.onError?.(e);
      }}
    />
  );
}
