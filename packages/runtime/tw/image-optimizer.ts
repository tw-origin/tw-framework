/**
 * Image Optimizer -- responsive images, lazy loading, format detection.
 *
 * Features:
 * - Lazy loading with IntersectionObserver
 * - Responsive srcset generation
 * - Format detection (WebP, AVIF)
 * - Blur-up placeholder
 * - Image compression hints
 * - Preloading critical images
 * - Error fallback
 * - Aspect ratio preservation
 * - Thumbnail generation
 */

// --- Types ------------------------------------------------------------

export interface ImageSource {
  src: string;
  width?: number;
  height?: number;
  format?: string;
}

export interface ResponsiveImageOptions {
  src: string;
  widths?: number[];
  sizes?: string;
  format?: "webp" | "avif" | "auto";
  quality?: number;
  lazy?: boolean;
  placeholder?: "blur" | "color" | "none";
  placeholderColor?: string;
  aspectRatio?: number;
  fallback?: string;
  preload?: boolean;
  onError?: (error: Error) => void;
}

export interface ProcessedImage {
  src: string;
  srcset: string;
  sizes: string;
  format: string;
  width: number;
  height: number;
  placeholder: string | null;
}

// --- Image Optimizer --------------------------------------------------

class ImageOptimizer {
  private supportedFormats = new Set<string>();
  private preloadedUrls = new Set<string>();
  private lazyObserver: IntersectionObserver | null = null;
  private lazyImages = new Map<string, HTMLImageElement>();

  constructor() {
    this.detectFormats();
  }

  /**
   * Detect browser-supported image formats.
   */
  private detectFormats(): void {
    if (typeof document === "undefined") return;

    // WebP
    const webpImg = new Image();
    webpImg.onload = () => { if (webpImg.width > 0) this.supportedFormats.add("webp"); };
    webpImg.src = "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";

    // AVIF
    const avifImg = new Image();
    avifImg.onload = () => { if (avifImg.width > 0) this.supportedFormats.add("avif"); };
    avifImg.src = "data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUEAAAGcbWV0YQAAAAA=";
  }

  /**
   * Check if a format is supported.
   */
  supportsFormat(format: string): boolean {
    return this.supportedFormats.has(format);
  }

  /**
   * Process an image for optimized rendering.
   */
  processImage(options: ResponsiveImageOptions): ProcessedImage {
    const widths = options.widths || [320, 640, 768, 1024, 1280, 1920];
    const format = options.format || "auto";

    // Generate srcset
    const srcsetParts: string[] = [];
    for (const width of widths) {
      const url = this.buildUrl(options.src, { width, format: format === "auto" ? undefined : format, quality: options.quality });
      srcsetParts.push(`${url} ${width}w`);
    }

    let width = widths[Math.floor(widths.length / 2)] || 640;
    let height: number | undefined;

    if (options.aspectRatio) {
      height = Math.round(width / options.aspectRatio);
    }

    return {
      src: this.buildUrl(options.src, { format: format === "auto" ? undefined : format, quality: options.quality }),
      srcset: srcsetParts.join(", "),
      sizes: options.sizes || "100vw",
      format: format === "auto" ? "original" : format,
      width,
      height: height || 0,
      placeholder: this.generatePlaceholder(options),
    };
  }

  /**
   * Create an optimized img element.
   */
  createImage(options: ResponsiveImageOptions): HTMLImageElement {
    const processed = this.processImage(options);
    const img = document.createElement("img");

    img.src = processed.src;
    img.srcset = processed.srcset;
    img.sizes = processed.sizes;
    img.alt = ""; // Should be set by caller
    img.loading = options.lazy !== false ? "lazy" : "eager";
    img.decoding = "async";

    if (processed.width) img.width = processed.width;
    if (processed.height) img.height = processed.height;

    // Placeholder
    if (options.placeholder === "blur" && processed.placeholder) {
      img.style.background = `url(${processed.placeholder}) center/cover`;
      img.style.filter = "blur(20px)";
    } else if (options.placeholder === "color" && options.placeholderColor) {
      img.style.backgroundColor = options.placeholderColor;
    }

    // Error fallback
    if (options.fallback) {
      img.onerror = () => {
        img.src = options.fallback!;
        img.srcset = "";
      };
    }

    if (options.onError) {
      img.addEventListener("error", () => options.onError!(new Error("Image failed to load")));
    }

    // Preload critical images
    if (options.preload) {
      this.preload(processed.src);
    }

    return img;
  }

  /**
   * Preload an image.
   */
  preload(url: string): void {
    if (this.preloadedUrls.has(url)) return;
    this.preloadedUrls.add(url);

    if (typeof document !== "undefined") {
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = url;
      document.head.appendChild(link);
    }
  }

  /**
   * Set up lazy loading for all images with data-tw-src attribute.
   */
  setupLazyLoading(root: HTMLElement = document.body): void {
    if (typeof IntersectionObserver === "undefined") {
      // Fallback: load all images immediately
      this.loadAllLazyImages(root);
      return;
    }

    this.lazyObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement;
          this.loadLazyImage(img as any);
          this.lazyObserver?.unobserve(img);
        }
      }
    }, { rootMargin: "100px" });

    const images = root.querySelectorAll("img[data-tw-src]");
    for (const img of Array.from(images)) {
      this.lazyObserver.observe(img);
    }
  }

  /**
   * Generate a responsive picture element.
   */
  createPictureElement(options: ResponsiveImageOptions): HTMLPictureElement {
    const picture = document.createElement("picture");

    // Add format sources (WebP, AVIF if supported)
    const formats: string[] = [];
    if (this.supportedFormats.has("avif")) formats.push("avif");
    if (this.supportedFormats.has("webp")) formats.push("webp");

    for (const format of formats) {
      const source = document.createElement("source");
      source.type = `image/${format}`;
      const srcset = (options.widths || [320, 640, 1024, 1920])
        .map(w => `${this.buildUrl(options.src, { width: w, format })} ${w}w`)
        .join(", ");
      source.srcset = srcset;
      source.sizes = options.sizes || "100vw";
      picture.appendChild(source);
    }

    // Fallback img element
    const img = this.createImage(options);
    picture.appendChild(img);

    return picture;
  }

  /**
   * Destroy the optimizer.
   */
  destroy(): void {
    if (this.lazyObserver) {
      this.lazyObserver.disconnect();
      this.lazyObserver = null;
    }
    this.lazyImages.clear();
    this.preloadedUrls.clear();
  }

  // --- Internal ------------------------------------------------------

  private buildUrl(src: string, params: { width?: number; format?: string; quality?: number }): string {
    // In a real implementation, this would integrate with an image CDN
    // For now, just return the original URL
    const url = new URL(src, typeof window !== "undefined" ? window.location.origin : "http://localhost");

    if (params.width) url.searchParams.set("w", String(params.width));
    if (params.format) url.searchParams.set("f", params.format);
    if (params.quality) url.searchParams.set("q", String(params.quality));

    return url.toString();
  }

  private generatePlaceholder(options: ResponsiveImageOptions): string | null {
    if (options.placeholder === "blur") {
      // Generate a tiny blurred placeholder
      // In production, this would use an actual low-quality image
      return `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect fill="${options.placeholderColor || "#e2e8f0"}" width="10" height="10"/></svg>`)}`;
    }
    return null;
  }

  private loadLazyImage(img: HTMLImageElement): void {
    const src = img.getAttribute("data-tw-src");
    const srcset = img.getAttribute("data-tw-srcset");

    if (src) img.src = src;
    if (srcset) img.srcset = srcset;

    img.removeAttribute("data-tw-src");
    img.removeAttribute("data-tw-srcset");
  }

  private loadAllLazyImages(root: HTMLElement): void {
    const images = root.querySelectorAll("img[data-tw-src]");
    for (const img of Array.from(images)) {
      this.loadLazyImage(img as any);
    }
  }
}

// --- Global Image Optimizer ------------------------------------------

let globalImageOptimizer: ImageOptimizer | null = null;

export function getImageOptimizer(): ImageOptimizer {
  if (!globalImageOptimizer) globalImageOptimizer = new ImageOptimizer();
  return globalImageOptimizer;
}

export function createOptimizedImage(options: ResponsiveImageOptions): HTMLImageElement {
  return getImageOptimizer().createImage(options);
}

export function createResponsivePicture(options: ResponsiveImageOptions): HTMLPictureElement {
  return getImageOptimizer().createPictureElement(options);
}

export function preloadImage(url: string): void {
  getImageOptimizer().preload(url);
}
