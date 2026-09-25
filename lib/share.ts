import { createPost } from './community';

export const SITE = 'https://homesang.pro';

/** Shareable deep link. `ref` appends a referral code for attribution. */
export function itemUrl(kind: 'products' | 'jobs', id: string, ref?: string): string {
  const base = `${SITE}/${kind}/${id}`;
  return ref ? `${base}?ref=${encodeURIComponent(ref)}` : base;
}

/** Referral invite link — the home URL carrying a signup referral code. */
export function inviteUrl(code: string): string {
  return `${SITE}/?ref=${encodeURIComponent(code.trim().toUpperCase())}`;
}

export type ShareResult = 'shared' | 'copied' | 'cancel' | 'none';

/**
 * Capture a rendered node (by nativeID → DOM id) to a JPG and share it via the
 * Web Share API (files), falling back to download. Web-only — returns 'none' on
 * native or when the node/capture is unavailable. Mirrors the invoice export.
 */
export async function shareNodeImage(nodeId: string, filename: string, shareText?: string): Promise<'shared' | 'downloaded' | 'none'> {
  if (typeof document === 'undefined') return 'none';
  const el = document.getElementById(nodeId);
  if (!el) return 'none';
  try {
    const h2c = (await import('html2canvas')).default;
    const canvas = await h2c(el as HTMLElement, { scale: 2, backgroundColor: '#ffffff', useCORS: true, allowTaint: false, logging: false });
    return await new Promise((resolve) => {
      canvas.toBlob(async (blob) => {
        if (!blob) return resolve('none');
        const file = new File([blob], `${filename}.jpg`, { type: 'image/jpeg' });
        const nav: any = navigator;
        if (nav.canShare && nav.canShare({ files: [file] })) {
          try { await nav.share({ files: [file], title: filename, text: shareText }); resolve('shared'); }
          catch { resolve('none'); }
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `${filename}.jpg`; a.click();
          URL.revokeObjectURL(url);
          resolve('downloaded');
        }
      }, 'image/jpeg', 0.92);
    });
  } catch (e) {
    console.error('shareNodeImage:', e);
    return 'none';
  }
}

/** Native share sheet (web share API) with clipboard-copy fallback. */
export async function shareItem(opts: { url: string; title: string; text?: string }): Promise<ShareResult> {
  const { url, title, text } = opts;
  const nav: any = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav?.share) {
    try {
      await nav.share({ title, text: text ?? title, url });
      return 'shared';
    } catch {
      return 'cancel';
    }
  }
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(url);
      return 'copied';
    } catch {
      /* fall through */
    }
  }
  return 'none';
}

/** Social platforms we offer one-tap web-share intents for. */
export type SharePlatform = 'facebook' | 'messenger' | 'whatsapp' | 'line' | 'telegram' | 'x';

/** Build a web share-intent URL for a platform (opens the platform's composer
 * pre-filled with our link + text). Works on web and mobile browsers. */
export function platformShareUrl(platform: SharePlatform, url: string, text: string): string {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  switch (platform) {
    case 'facebook': return `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${t}`;
    case 'messenger': return `https://www.facebook.com/dialog/send?link=${u}&app_id=0&redirect_uri=${u}`;
    case 'whatsapp': return `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`;
    case 'line': return `https://social-plugins.line.me/lineit/share?url=${u}&text=${t}`;
    case 'telegram': return `https://t.me/share/url?url=${u}&text=${t}`;
    case 'x': return `https://twitter.com/intent/tweet?url=${u}&text=${t}`;
  }
}

/** Open a platform share intent in a new tab/window (web). */
export function openShare(platform: SharePlatform, url: string, text: string) {
  const target = platformShareUrl(platform, url, text);
  if (typeof window !== 'undefined') window.open(target, '_blank', 'noopener,noreferrer,width=600,height=560');
}

export async function copyLink(url: string): Promise<boolean> {
  const nav: any = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(url);
      return true;
    } catch {
      /* */
    }
  }
  return false;
}

/** Post the item to the ໂຮມເພື່ອນ community feed as a "sell" post. When a
 * productId is given the post is shoppable (product card + add-to-cart). */
export async function postToCommunity(opts: {
  authorId: string;
  authorName: string;
  title: string;
  url: string;
  price?: number;
  image?: string;
  productId?: string;
  productUnit?: string;
  shopId?: string;
}): Promise<void> {
  const { authorId, authorName, title, url, price, image, productId, productUnit, shopId } = opts;
  // a shoppable (product-linked) post renders the link as a card, so drop the
  // raw URL from the text; free-text shares keep it.
  const content = `🛒 ${title}${price ? ` — ${price.toLocaleString()} LAK` : ''}${productId ? '' : `\n${url}`}`;
  await createPost({
    authorId,
    authorName,
    content,
    type: 'sell',
    price,
    images: image ? [image] : undefined,
    ...(productId ? { productId, productName: title, productImage: image, productPrice: price, productUnit, shopId } : {}),
  });
}
