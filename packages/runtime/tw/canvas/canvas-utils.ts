/**
 * Canvas utilities -- drawing, rendering, animation, pixel manipulation.
 * @module runtime/canvas
 */

export interface Point { x: number; y: number; }
export interface Size { width: number; height: number; }
export interface Rect { x: number; y: number; width: number; height: number; }
export interface Color { r: number; g: number; b: number; a: number; }

export class CanvasContext {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private dpr: number;

  constructor(canvas: HTMLCanvasElement, options?: { width?: number; height?: number; dpr?: number }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.width = options?.width ?? canvas.clientWidth ?? 300;
    this.height = options?.height ?? canvas.clientHeight ?? 150;
    this.dpr = options?.dpr ?? window.devicePixelRatio ?? 1;
    this.resize(this.width, this.height);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.canvas.width = width * this.dpr;
    this.canvas.height = height * this.dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.scale(this.dpr, this.dpr);
  }

  clear(color?: string): void {
    if (color) {
      this.ctx.fillStyle = color;
      this.ctx.fillRect(0, 0, this.width, this.height);
    } else {
      this.ctx.clearRect(0, 0, this.width, this.height);
    }
  }

  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  getWidth(): number {
    return this.width;
  }

  getHeight(): number {
    return this.height;
  }

  getDPR(): number {
    return this.dpr;
  }

  setFillStyle(style: string | CanvasGradient | CanvasPattern): void {
    this.ctx.fillStyle = style;
  }

  setStrokeStyle(style: string | CanvasGradient | CanvasPattern): void {
    this.ctx.strokeStyle = style;
  }

  setLineWidth(width: number): void {
    this.ctx.lineWidth = width;
  }

  setLineCap(cap: CanvasLineCap): void {
    this.ctx.lineCap = cap;
  }

  setLineJoin(join: CanvasLineJoin): void {
    this.ctx.lineJoin = join;
  }

  setFont(font: string): void {
    this.ctx.font = font;
  }

  setTextAlign(align: CanvasTextAlign): void {
    this.ctx.textAlign = align;
  }

  setTextBaseline(baseline: CanvasTextBaseline): void {
    this.ctx.textBaseline = baseline;
  }

  setGlobalAlpha(alpha: number): void {
    this.ctx.globalAlpha = alpha;
  }

  setGlobalCompositeOperation(operation: GlobalCompositeOperation): void {
    this.ctx.globalCompositeOperation = operation;
  }

  setShadow(color: string, blur: number = 0, offsetX: number = 0, offsetY: number = 0): void {
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = blur;
    this.ctx.shadowOffsetX = offsetX;
    this.ctx.shadowOffsetY = offsetY;
  }

  clearShadow(): void {
    this.ctx.shadowColor = "transparent";
    this.ctx.shadowBlur = 0;
    this.ctx.shadowOffsetX = 0;
    this.ctx.shadowOffsetY = 0;
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    this.ctx.fillRect(x, y, width, height);
  }

  strokeRect(x: number, y: number, width: number, height: number): void {
    this.ctx.strokeRect(x, y, width, height);
  }

  clearRect(x: number, y: number, width: number, height: number): void {
    this.ctx.clearRect(x, y, width, height);
  }

  fillCircle(x: number, y: number, radius: number): void {
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  strokeCircle(x: number, y: number, radius: number): void {
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  fillEllipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number = 0): void {
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, radiusX, radiusY, rotation, 0, Math.PI * 2);
    this.ctx.fill();
  }

  strokeEllipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number = 0): void {
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, radiusX, radiusY, rotation, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  drawLine(x1: number, y1: number, x2: number, y2: number): void {
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
  }

  drawLines(points: Point[]): void {
    if (points.length < 2) return;
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      this.ctx.lineTo(points[i].x, points[i].y);
    }
    this.ctx.stroke();
  }

  fillPolygon(points: Point[]): void {
    if (points.length < 3) return;
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      this.ctx.lineTo(points[i].x, points[i].y);
    }
    this.ctx.closePath();
    this.ctx.fill();
  }

  strokePolygon(points: Point[]): void {
    if (points.length < 3) return;
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      this.ctx.lineTo(points[i].x, points[i].y);
    }
    this.ctx.closePath();
    this.ctx.stroke();
  }

  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    this.ctx.fillText(text, x, y, maxWidth);
  }

  strokeText(text: string, x: number, y: number, maxWidth?: number): void {
    this.ctx.strokeText(text, x, y, maxWidth);
  }

  measureText(text: string): TextMetrics {
    return this.ctx.measureText(text);
  }

  drawImage(image: CanvasImageSource, x: number, y: number, width?: number, height?: number): void {
    if (width !== undefined && height !== undefined) {
      this.ctx.drawImage(image, x, y, width, height);
    } else {
      this.ctx.drawImage(image, x, y);
    }
  }

  drawImageSlice(image: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void {
    this.ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  createLinearGradient(x1: number, y1: number, x2: number, y2: number, stops: Array<{ offset: number; color: string }>): CanvasGradient {
    const gradient = this.ctx.createLinearGradient(x1, y1, x2, y2);
    for (const stop of stops) {
      gradient.addColorStop(stop.offset, stop.color);
    }
    return gradient;
  }

  createRadialGradient(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number, stops: Array<{ offset: number; color: string }>): CanvasGradient {
    const gradient = this.ctx.createRadialGradient(x1, y1, r1, x2, y2, r2);
    for (const stop of stops) {
      gradient.addColorStop(stop.offset, stop.color);
    }
    return gradient;
  }

  createPattern(image: CanvasImageSource, repetition: string | null = "repeat"): CanvasPattern | null {
    return this.ctx.createPattern(image, repetition);
  }

  save(): void {
    this.ctx.save();
  }

  restore(): void {
    this.ctx.restore();
  }

  translate(x: number, y: number): void {
    this.ctx.translate(x, y);
  }

  rotate(angle: number): void {
    this.ctx.rotate(angle);
  }

  scale(x: number, y: number): void {
    this.ctx.scale(x, y);
  }

  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.ctx.transform(a, b, c, d, e, f);
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.ctx.setTransform(a, b, c, d, e, f);
  }

  resetTransform(): void {
    this.ctx.resetTransform();
  }

  clip(fillRule?: CanvasFillRule): void {
    this.ctx.clip(fillRule);
  }

  isPointInPath(x: number, y: number, fillRule?: CanvasFillRule): boolean {
    return this.ctx.isPointInPath(x, y, fillRule);
  }

  isPointInStroke(x: number, y: number): boolean {
    return this.ctx.isPointInStroke(x, y);
  }

  beginPath(): void {
    this.ctx.beginPath();
  }

  closePath(): void {
    this.ctx.closePath();
  }

  moveTo(x: number, y: number): void {
    this.ctx.moveTo(x, y);
  }

  lineTo(x: number, y: number): void {
    this.ctx.lineTo(x, y);
  }

  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean): void {
    this.ctx.arc(x, y, radius, startAngle, endAngle, anticlockwise);
  }

  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void {
    this.ctx.arcTo(x1, y1, x2, y2, radius);
  }

  ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, anticlockwise?: boolean): void {
    this.ctx.ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise);
  }

  rect(x: number, y: number, width: number, height: number): void {
    this.ctx.rect(x, y, width, height);
  }

  roundRect(x: number, y: number, width: number, height: number, radii: number | number[]): void {
    this.ctx.roundRect(x, y, width, height, radii);
  }

  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
    this.ctx.quadraticCurveTo(cpx, cpy, x, y);
  }

  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void {
    this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
  }

  fill(fillRule?: CanvasFillRule): void {
    this.ctx.fill(fillRule);
  }

  stroke(): void {
    this.ctx.stroke();
  }

  drawFocusIfNeeded(element: Element): void {
    this.ctx.drawFocusIfNeeded(element);
  }

  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData {
    return this.ctx.getImageData(sx, sy, sw, sh);
  }

  putImageData(imageData: ImageData, dx: number, dy: number, dirtyX?: number, dirtyY?: number, dirtyWidth?: number, dirtyHeight?: number): void {
    this.ctx.putImageData(imageData, dx, dy, dirtyX, dirtyY, dirtyWidth, dirtyHeight);
  }

  createImageData(width: number, height: number): ImageData {
    return this.ctx.createImageData(width, height);
  }

  getPixel(x: number, y: number): Color {
    const imageData = this.ctx.getImageData(x, y, 1, 1);
    const data = imageData.data;
    return { r: data[0], g: data[1], b: data[2], a: data[3] };
  }

  setPixel(x: number, y: number, color: Color): void {
    const imageData = this.ctx.createImageData(1, 1);
    imageData.data[0] = color.r;
    imageData.data[1] = color.g;
    imageData.data[2] = color.b;
    imageData.data[3] = color.a;
    this.ctx.putImageData(imageData, x, y);
  }

  getPixels(rect: Rect): ImageData {
    return this.ctx.getImageData(rect.x, rect.y, rect.width, rect.height);
  }

  setPixels(x: number, y: number, imageData: ImageData): void {
    this.ctx.putImageData(imageData, x, y);
  }

  fillPixels(rect: Rect, color: Color): void {
    const imageData = this.ctx.createImageData(rect.width, rect.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = color.r;
      data[i + 1] = color.g;
      data[i + 2] = color.b;
      data[i + 3] = color.a;
    }
    this.ctx.putImageData(imageData, rect.x, rect.y);
  }

  toDataURL(type?: string, quality?: number): string {
    return this.canvas.toDataURL(type, quality);
  }

  toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void {
    this.canvas.toBlob(callback, type, quality);
  }

  async toBlobAsync(type?: string, quality?: number): Promise<Blob | null> {
    return new Promise((resolve) => {
      this.canvas.toBlob(resolve, type, quality);
    });
  }

  drawGrid(cellSize: number, color: string = "#ddd"): void {
    this.save();
    this.setStrokeStyle(color);
    this.setLineWidth(0.5);
    for (let x = 0; x <= this.width; x += cellSize) {
      this.drawLine(x, 0, x, this.height);
    }
    for (let y = 0; y <= this.height; y += cellSize) {
      this.drawLine(0, y, this.width, y);
    }
    this.restore();
  }

  drawCenteredText(text: string, x: number, y: number, font?: string): void {
    if (font) this.setFont(font);
    this.setTextAlign("center");
    this.setTextBaseline("middle");
    this.fillText(text, x, y);
  }

  drawWrappedText(text: string, x: number, y: number, maxWidth: number, lineHeight: number): void {
    const words = text.split(" ");
    let line = "";
    let currentY = y;
    for (const word of words) {
      const testLine = line + word + " ";
      const metrics = this.measureText(testLine);
      if (metrics.width > maxWidth && line !== "") {
        this.fillText(line, x, currentY);
        line = word + " ";
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    this.fillText(line, x, currentY);
  }

  drawRoundedRect(x: number, y: number, width: number, height: number, radius: number, fill?: boolean, stroke?: boolean): void {
    this.beginPath();
    this.moveTo(x + radius, y);
    this.lineTo(x + width - radius, y);
    this.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.lineTo(x + width, y + height - radius);
    this.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    this.lineTo(x + radius, y + height);
    this.quadraticCurveTo(x, y + height, x, y + height - radius);
    this.lineTo(x, y + radius);
    this.quadraticCurveTo(x, y, x + radius, y);
    this.closePath();
    if (fill) this.fill();
    if (stroke) this.stroke();
  }

  drawArrow(fromX: number, fromY: number, toX: number, toY: number, headLength: number = 10, headAngle: number = Math.PI / 6): void {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);
    this.beginPath();
    this.moveTo(fromX, fromY);
    this.lineTo(toX, toY);
    this.lineTo(toX - headLength * Math.cos(angle - headAngle), toY - headLength * Math.sin(angle - headAngle));
    this.moveTo(toX, toY);
    this.lineTo(toX - headLength * Math.cos(angle + headAngle), toY - headLength * Math.sin(angle + headAngle));
    this.stroke();
  }

  drawStar(x: number, y: number, outerRadius: number, innerRadius: number, points: number = 5): void {
    this.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = (Math.PI / points) * i - Math.PI / 2;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (i === 0) this.moveTo(px, py);
      else this.lineTo(px, py);
    }
    this.closePath();
  }

  drawHeart(x: number, y: number, size: number): void {
    this.beginPath();
    this.moveTo(x, y + size / 4);
    this.bezierCurveTo(x, y, x - size / 2, y, x - size / 2, y + size / 4);
    this.bezierCurveTo(x - size / 2, y + size / 2, x, y + size * 3 / 4, x, y + size);
    this.bezierCurveTo(x, y + size * 3 / 4, x + size / 2, y + size / 2, x + size / 2, y + size / 4);
    this.bezierCurveTo(x + size / 2, y, x, y, x, y + size / 4);
    this.closePath();
  }

  drawDonut(x: number, y: number, outerRadius: number, innerRadius: number, startAngle: number = 0, endAngle: number = Math.PI * 2): void {
    this.beginPath();
    this.arc(x, y, outerRadius, startAngle, endAngle);
    this.arc(x, y, innerRadius, endAngle, startAngle, true);
    this.closePath();
  }

  applyFilter(filter: string): void {
    this.ctx.filter = filter;
  }

  clearFilter(): void {
    this.ctx.filter = "none";
  }

  drawImageWithFilter(image: CanvasImageSource, x: number, y: number, filter: string): void {
    this.save();
    this.applyFilter(filter);
    this.drawImage(image, x, y);
    this.clearFilter();
    this.restore();
  }

  invertColors(rect?: Rect): void {
    const r = rect ?? { x: 0, y: 0, width: this.width, height: this.height };
    const imageData = this.getImageData(r.x, r.y, r.width, r.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
    this.putImageData(imageData, r.x, r.y);
  }

  grayscale(rect?: Rect): void {
    const r = rect ?? { x: 0, y: 0, width: this.width, height: this.height };
    const imageData = this.getImageData(r.x, r.y, r.width, r.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }
    this.putImageData(imageData, r.x, r.y);
  }

  sepia(rect?: Rect): void {
    const r = rect ?? { x: 0, y: 0, width: this.width, height: this.height };
    const imageData = this.getImageData(r.x, r.y, r.width, r.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r_val = data[i];
      const g_val = data[i + 1];
      const b_val = data[i + 2];
      data[i] = Math.min(255, r_val * 0.393 + g_val * 0.769 + b_val * 0.189);
      data[i + 1] = Math.min(255, r_val * 0.349 + g_val * 0.686 + b_val * 0.168);
      data[i + 2] = Math.min(255, r_val * 0.272 + g_val * 0.534 + b_val * 0.131);
    }
    this.putImageData(imageData, r.x, r.y);
  }

  brightness(factor: number, rect?: Rect): void {
    const r = rect ?? { x: 0, y: 0, width: this.width, height: this.height };
    const imageData = this.getImageData(r.x, r.y, r.width, r.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, data[i] * factor));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * factor));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * factor));
    }
    this.putImageData(imageData, r.x, r.y);
  }

  contrast(factor: number, rect?: Rect): void {
    const r = rect ?? { x: 0, y: 0, width: this.width, height: this.height };
    const imageData = this.getImageData(r.x, r.y, r.width, r.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, (data[i] - 128) * factor + 128));
      data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * factor + 128));
      data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * factor + 128));
    }
    this.putImageData(imageData, r.x, r.y);
  }

  blur(radius: number): void {
    this.applyFilter(`blur(${radius}px)`);
  }

  sharpen(): void {
    this.applyFilter("contrast(1.5)");
  }

  saturate(factor: number): void {
    this.applyFilter(`saturate(${factor})`);
  }

  hueRotate(degrees: number): void {
    this.applyFilter(`hue-rotate(${degrees}deg)`);
  }

  opacity(value: number): void {
    this.applyFilter(`opacity(${value})`);
  }

  dropShadow(color: string, blur: number, x: number, y: number): void {
    this.applyFilter(`drop-shadow(${x}px ${y}px ${blur}px ${color})`);
  }

  getColorAt(x: number, y: number): string {
    const color = this.getPixel(x, y);
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`;
  }

  floodFill(x: number, y: number, fillColor: Color): void {
    const imageData = this.getImageData(0, 0, this.width, this.height);
    const data = imageData.data;
    const targetColor = this.getPixelColorAt(data, x, y, this.width);
    if (this.colorsMatch(targetColor, fillColor)) return;
    const stack: Point[] = [{ x, y }];
    while (stack.length > 0) {
      const point = stack.pop()!;
      const index = (point.y * this.width + point.x) * 4;
      if (point.x < 0 || point.x >= this.width || point.y < 0 || point.y >= this.height) continue;
      const currentColor = this.getPixelColorAt(data, point.x, point.y, this.width);
      if (!this.colorsMatch(currentColor, targetColor)) continue;
      data[index] = fillColor.r;
      data[index + 1] = fillColor.g;
      data[index + 2] = fillColor.b;
      data[index + 3] = fillColor.a;
      stack.push({ x: point.x + 1, y: point.y });
      stack.push({ x: point.x - 1, y: point.y });
      stack.push({ x: point.x, y: point.y + 1 });
      stack.push({ x: point.x, y: point.y - 1 });
    }
    this.putImageData(imageData, 0, 0);
  }

  private getPixelColorAt(data: Uint8ClampedArray, x: number, y: number, width: number): Color {
    const index = (y * width + x) * 4;
    return { r: data[index], g: data[index + 1], b: data[index + 2], a: data[index + 3] };
  }

  private colorsMatch(a: Color, b: Color): boolean {
    return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
  }

  drawWithOpacity(opacity: number, drawFn: () => void): void {
    this.save();
    this.setGlobalAlpha(opacity);
    drawFn();
    this.restore();
  }

  clipRect(rect: Rect, drawFn: () => void): void {
    this.save();
    this.beginPath();
    this.rect(rect.x, rect.y, rect.width, rect.height);
    this.clip();
    drawFn();
    this.restore();
  }

  clipCircle(x: number, y: number, radius: number, drawFn: () => void): void {
    this.save();
    this.beginPath();
    this.arc(x, y, radius, 0, Math.PI * 2);
    this.clip();
    drawFn();
    this.restore();
  }

  clipPath(points: Point[], drawFn: () => void): void {
    this.save();
    this.beginPath();
    if (points.length > 0) {
      this.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        this.lineTo(points[i].x, points[i].y);
      }
      this.closePath();
      this.clip();
    }
    drawFn();
    this.restore();
  }

  drawWithTransform(transform: { translate?: Point; rotate?: number; scale?: Point }, drawFn: () => void): void {
    this.save();
    if (transform.translate) {
      this.translate(transform.translate.x, transform.translate.y);
    }
    if (transform.rotate) {
      this.rotate(transform.rotate);
    }
    if (transform.scale) {
      this.scale(transform.scale.x, transform.scale.y);
    }
    drawFn();
    this.restore();
  }

  drawWithShadow(shadow: { color: string; blur: number; offsetX: number; offsetY: number }, drawFn: () => void): void {
    this.save();
    this.setShadow(shadow.color, shadow.blur, shadow.offsetX, shadow.offsetY);
    drawFn();
    this.clearShadow();
    this.restore();
  }

  measureTextWidth(text: string, font?: string): number {
    if (font) this.setFont(font);
    return this.measureText(text).width;
  }

  measureTextHeight(text: string, font?: string): number {
    if (font) this.setFont(font);
    const metrics = this.measureText(text);
    return metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
  }

  fitText(text: string, maxWidth: number, font?: string): string {
    if (font) this.setFont(font);
    const ellipsis = "...";
    if (this.measureTextWidth(text) <= maxWidth) return text;
    let truncated = text;
    while (truncated.length > 0 && this.measureTextWidth(truncated + ellipsis) > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    return truncated + ellipsis;
  }

  wrapText(text: string, maxWidth: number, font?: string): string[] {
    if (font) this.setFont(font);
    const words = text.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const testLine = line + (line ? " " : "") + word;
      if (this.measureTextWidth(testLine) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  destroy(): void {
    this.clear();
  }
}

export function createCanvasContext(canvas: HTMLCanvasElement, options?: { width?: number; height?: number; dpr?: number }): CanvasContext {
  return new CanvasContext(canvas, options);
}

export class CanvasAnimation {
  private context: CanvasContext;
  private frameId: number | null = null;
  private isPlaying: boolean = false;
  private lastTime: number = 0;
  private fps: number = 60;
  private frameCount: number = 0;
  private startTime: number = 0;
  private callbacks: Array<(deltaTime: number, elapsedTime: number) => void> = [];

  constructor(context: CanvasContext) {
    this.context = context;
  }

  start(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.startTime = performance.now();
    this.lastTime = this.startTime;
    this.frameCount = 0;
    this.loop();
  }

  stop(): void {
    this.isPlaying = false;
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  pause(): void {
    this.isPlaying = false;
  }

  resume(): void {
    if (!this.isPlaying) {
      this.isPlaying = true;
      this.lastTime = performance.now();
      this.loop();
    }
  }

  isPlayingCheck(): boolean {
    return this.isPlaying;
  }

  getFPS(): number {
    return this.fps;
  }

  getFrameCount(): number {
    return this.frameCount;
  }

  getElapsedTime(): number {
    return performance.now() - this.startTime;
  }

  addCallback(callback: (deltaTime: number, elapsedTime: number) => void): () => void {
    this.callbacks.push(callback);
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index !== -1) this.callbacks.splice(index, 1);
    };
  }

  removeCallback(callback: (deltaTime: number, elapsedTime: number) => void): void {
    const index = this.callbacks.indexOf(callback);
    if (index !== -1) this.callbacks.splice(index, 1);
  }

  clearCallbacks(): void {
    this.callbacks = [];
  }

  private loop = (): void => {
    if (!this.isPlaying) return;
    const now = performance.now();
    const deltaTime = now - this.lastTime;
    const elapsedTime = now - this.startTime;
    this.fps = 1000 / deltaTime;
    this.frameCount++;
    for (const callback of this.callbacks) {
      callback(deltaTime, elapsedTime);
    }
    this.lastTime = now;
    this.frameId = requestAnimationFrame(this.loop);
  };

  destroy(): void {
    this.stop();
    this.clearCallbacks();
  }
}

export function createCanvasAnimation(context: CanvasContext): CanvasAnimation {
  return new CanvasAnimation(context);
}

export function hexToColor(hex: string): Color {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(hex);
  if (!result) return { r: 0, g: 0, b: 0, a: 255 };
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
    a: result[4] ? parseInt(result[4], 16) : 255,
  };
}

export function colorToHex(color: Color): string {
  const r = color.r.toString(16).padStart(2, "0");
  const g = color.g.toString(16).padStart(2, "0");
  const b = color.b.toString(16).padStart(2, "0");
  const a = color.a < 255 ? color.a.toString(16).padStart(2, "0") : "";
  return `#${r}${g}${b}${a}`;
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h /= 360; s /= 100; l /= 100;
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (max !== min) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, v: v * 100 };
}

export function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  h /= 360; s /= 100; v /= 100;
  let r: number, g: number, b: number;
  let i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  let t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

export function lightenColor(hex: string, percent: number): string {
  const color = hexToColor(hex);
  const hsl = rgbToHsl(color.r, color.g, color.b);
  hsl.l = Math.min(100, hsl.l + percent);
  const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
  return colorToHex({ ...rgb, a: color.a });
}

export function darkenColor(hex: string, percent: number): string {
  const color = hexToColor(hex);
  const hsl = rgbToHsl(color.r, color.g, color.b);
  hsl.l = Math.max(0, hsl.l - percent);
  const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
  return colorToHex({ ...rgb, a: color.a });
}

export function mixColors(hex1: string, hex2: string, weight: number = 0.5): string {
  const c1 = hexToColor(hex1);
  const c2 = hexToColor(hex2);
  return colorToHex({
    r: Math.round(c1.r * (1 - weight) + c2.r * weight),
    g: Math.round(c1.g * (1 - weight) + c2.g * weight),
    b: Math.round(c1.b * (1 - weight) + c2.b * weight),
    a: Math.round(c1.a * (1 - weight) + c2.a * weight),
  });
}

export function randomColor(): string {
  return `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")}`;
}

export function complementaryColor(hex: string): string {
  const color = hexToColor(hex);
  return colorToHex({ r: 255 - color.r, g: 255 - color.g, b: 255 - color.b, a: color.a });
}
