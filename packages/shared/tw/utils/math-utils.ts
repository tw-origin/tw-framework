/**
 * Math utilities -- advanced math, statistics, geometry, linear algebra.
 * @module shared/utils
 */

export class Vector2 {
  constructor(public x: number = 0, public y: number = 0) {}

  static zero(): Vector2 { return new Vector2(0, 0); }
  static one(): Vector2 { return new Vector2(1, 1); }
  static up(): Vector2 { return new Vector2(0, 1); }
  static down(): Vector2 { return new Vector2(0, -1); }
  static left(): Vector2 { return new Vector2(-1, 0); }
  static right(): Vector2 { return new Vector2(1, 0); }
  static upLeft(): Vector2 { return new Vector2(-1, 1); }
  static upRight(): Vector2 { return new Vector2(1, 1); }
  static downLeft(): Vector2 { return new Vector2(-1, -1); }
  static downRight(): Vector2 { return new Vector2(1, -1); }
  static random(min: number = 0, max: number = 1): Vector2 { return new Vector2(min + Math.random() * (max - min), min + Math.random() * (max - min)); }
  static fromAngle(angle: number, length: number = 1): Vector2 { return new Vector2(Math.cos(angle) * length, Math.sin(angle) * length); }
  static fromArray(array: number[]): Vector2 { return new Vector2(array[0] ?? 0, array[1] ?? 0); }
  static fromObject(obj: { x: number; y: number }): Vector2 { return new Vector2(obj.x, obj.y); }
  static lerp(a: Vector2, b: Vector2, t: number): Vector2 { return new Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); }
  static lerpUnclamped(a: Vector2, b: Vector2, t: number): Vector2 { return Vector2.lerp(a, b, t); }
  static lerpAngle(a: Vector2, b: Vector2, t: number): Vector2 { return Vector2.lerp(a, b, t); }
  static moveTowards(current: Vector2, target: Vector2, maxDistanceDelta: number): Vector2 {
    const diff = target.subtract(current);
    const dist = diff.magnitude();
    if (dist <= maxDistanceDelta || dist === 0) return target;
    return current.add(diff.divide(dist * maxDistanceDelta));
  }
  static reflect(inDirection: Vector2, inNormal: Vector2): Vector2 {
    const factor = -2 * inDirection.dot(inNormal);
    return new Vector2(factor * inNormal.x + inDirection.x, factor * inNormal.y + inDirection.y);
  }
  static dot(a: Vector2, b: Vector2): number { return a.x * b.x + a.y * b.y; }
  static cross(a: Vector2, b: Vector2): number { return a.x * b.y - a.y * b.x; }
  static distance(a: Vector2, b: Vector2): number { return a.subtract(b).magnitude(); }
  static distanceSquared(a: Vector2, b: Vector2): number { return a.subtract(b).sqrMagnitude(); }
  static angle(a: Vector2, b: Vector2): number {
    const dot = Vector2.dot(a, b);
    const mag = a.magnitude() * b.magnitude();
    return mag === 0 ? 0 : Math.acos(Math.min(1, Math.max(-1, dot / mag)));
  }
  static signedAngle(a: Vector2, b: Vector2): number {
    const unsigned = Vector2.angle(a, b);
    const cross = Vector2.cross(a, b);
    return cross < 0 ? -unsigned : unsigned;
  }
  static min(a: Vector2, b: Vector2): Vector2 { return new Vector2(Math.min(a.x, b.x), Math.min(a.y, b.y)); }
  static max(a: Vector2, b: Vector2): Vector2 { return new Vector2(Math.max(a.x, b.x), Math.max(a.y, b.y)); }
  static scale(a: Vector2, b: Vector2): Vector2 { return new Vector2(a.x * b.x, a.y * b.y); }
  static project(a: Vector2, b: Vector2): Vector2 {
    const dot = Vector2.dot(a, b);
    const sqrMag = b.sqrMagnitude();
    return sqrMag === 0 ? Vector2.zero() : b.multiply(dot / sqrMag);
  }
  static projectOnPlane(a: Vector2, normal: Vector2): Vector2 { return a.subtract(Vector2.project(a, normal)); }
  static perpendicular(a: Vector2): Vector2 { return new Vector2(-a.y, a.x); }
  static midpoint(a: Vector2, b: Vector2): Vector2 { return new Vector2((a.x + b.x) / 2, (a.y + b.y) / 2); }
  static centroid(points: Vector2[]): Vector2 {
    if (points.length === 0) return Vector2.zero();
    let sum = points.reduce((acc, p) => acc.add(p), Vector2.zero());
    return sum.divide(points.length);
  }

  add(other: Vector2): Vector2 { return new Vector2(this.x + other.x, this.y + other.y); }
  subtract(other: Vector2): Vector2 { return new Vector2(this.x - other.x, this.y - other.y); }
  multiply(scalar: number): Vector2 { return new Vector2(this.x * scalar, this.y * scalar); }
  divide(scalar: number): Vector2 { return new Vector2(this.x / scalar, this.y / scalar); }
  negate(): Vector2 { return new Vector2(-this.x, -this.y); }
  normalize(): Vector2 { const mag = this.magnitude(); return mag === 0 ? Vector2.zero() : this.divide(mag); }
  magnitude(): number { return Math.sqrt(this.x * this.x + this.y * this.y); }
  sqrMagnitude(): number { return this.x * this.x + this.y * this.y; }
  dot(other: Vector2): number { return this.x * other.x + this.y * other.y; }
  cross(other: Vector2): number { return this.x * other.y - this.y * other.x; }
  angle(): number { return Math.atan2(this.y, this.x); }
  rotate(angle: number): Vector2 { const cos = Math.cos(angle); const sin = Math.sin(angle); return new Vector2(this.x * cos - this.y * sin, this.x * sin + this.y * cos); }
  rotateAround(center: Vector2, angle: number): Vector2 { return this.subtract(center).rotate(angle).add(center); }
  distanceTo(other: Vector2): number { return this.subtract(other).magnitude(); }
  distanceSquaredTo(other: Vector2): number { return this.subtract(other).sqrMagnitude(); }
  equals(other: Vector2, epsilon: number = 0.0001): boolean { return Math.abs(this.x - other.x) < epsilon && Math.abs(this.y - other.y) < epsilon; }
  clone(): Vector2 { return new Vector2(this.x, this.y); }
  toArray(): number[] { return [this.x, this.y]; }
  toObject(): { x: number; y: number } { return { x: this.x, y: this.y }; }
  toString(): string { return `(${this.x}, ${this.y})`; }
  set(x: number, y: number): void { this.x = x; this.y = y; }
  setX(x: number): void { this.x = x; }
  setY(y: number): void { this.y = y; }
  addInPlace(other: Vector2): void { this.x += other.x; this.y += other.y; }
  subtractInPlace(other: Vector2): void { this.x -= other.x; this.y -= other.y; }
  multiplyInPlace(scalar: number): void { this.x *= scalar; this.y *= scalar; }
  divideInPlace(scalar: number): void { this.x /= scalar; this.y /= scalar; }
  normalizeInPlace(): void { const mag = this.magnitude(); if (mag > 0) { this.x /= mag; this.y /= mag; } }
  negateInPlace(): void { this.x = -this.x; this.y = -this.y; }
  rotateInPlace(angle: number): void { const cos = Math.cos(angle); const sin = Math.sin(angle); let x = this.x * cos - this.y * sin; let y = this.x * sin + this.y * cos; this.x = x; this.y = y; }
  clamp(mag: number): void { const currentMag = this.magnitude(); if (currentMag > mag) { this.normalizeInPlace(); this.multiplyInPlace(mag); } }
  clampMagnitude(mag: number): Vector2 { const currentMag = this.magnitude(); if (currentMag > mag && currentMag > 0) { return this.normalize().multiply(mag); } return this.clone(); }
  static clampMagnitude(v: Vector2, max: number): Vector2 { return v.clampMagnitude(max); }
  static smoothDamp(current: Vector2, target: Vector2, velocity: Vector2, smoothTime: number, maxSpeed: number = Infinity, deltaTime: number = 0.02): { position: Vector2; velocity: Vector2 } {
    smoothTime = Math.max(0.0001, smoothTime);
    const omega = 2 / smoothTime;
    const x = omega * deltaTime;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    let change = current.subtract(target);
    const maxChange = maxSpeed * smoothTime;
    change = change.clampMagnitude(maxChange);
    const temp = velocity.add(change.multiply(omega)).multiply(deltaTime);
    const newVelocity = velocity.subtract(temp.multiply(omega)).multiply(exp);
    const newPosition = target.add(change.add(temp)).multiply(exp);
    const origChange = current.subtract(target);
    const newChange = newPosition.subtract(target);
    if (origChange.dot(newChange) <= 0) {
      return { position: target.clone(), velocity: Vector2.zero() };
    }
    return { position: newPosition, velocity: newVelocity };
  }
}

export class Vector3 {
  constructor(public x: number = 0, public y: number = 0, public z: number = 0) {}

  static zero(): Vector3 { return new Vector3(0, 0, 0); }
  static one(): Vector3 { return new Vector3(1, 1, 1); }
  static up(): Vector3 { return new Vector3(0, 1, 0); }
  static down(): Vector3 { return new Vector3(0, -1, 0); }
  static left(): Vector3 { return new Vector3(-1, 0, 0); }
  static right(): Vector3 { return new Vector3(1, 0, 0); }
  static forward(): Vector3 { return new Vector3(0, 0, 1); }
  static back(): Vector3 { return new Vector3(0, 0, -1); }
  static random(min: number = 0, max: number = 1): Vector3 { return new Vector3(min + Math.random() * (max - min), min + Math.random() * (max - min), min + Math.random() * (max - min)); }
  static fromArray(array: number[]): Vector3 { return new Vector3(array[0] ?? 0, array[1] ?? 0, array[2] ?? 0); }
  static fromObject(obj: { x: number; y: number; z: number }): Vector3 { return new Vector3(obj.x, obj.y, obj.z); }
  static lerp(a: Vector3, b: Vector3, t: number): Vector3 { return new Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t); }
  static dot(a: Vector3, b: Vector3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }
  static cross(a: Vector3, b: Vector3): Vector3 { return new Vector3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
  static distance(a: Vector3, b: Vector3): number { return a.subtract(b).magnitude(); }
  static distanceSquared(a: Vector3, b: Vector3): number { return a.subtract(b).sqrMagnitude(); }
  static angle(a: Vector3, b: Vector3): number {
    const dot = Vector3.dot(a, b);
    const mag = a.magnitude() * b.magnitude();
    return mag === 0 ? 0 : Math.acos(Math.min(1, Math.max(-1, dot / mag)));
  }
  static min(a: Vector3, b: Vector3): Vector3 { return new Vector3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)); }
  static max(a: Vector3, b: Vector3): Vector3 { return new Vector3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)); }
  static scale(a: Vector3, b: Vector3): Vector3 { return new Vector3(a.x * b.x, a.y * b.y, a.z * b.z); }
  static project(a: Vector3, b: Vector3): Vector3 {
    const dot = Vector3.dot(a, b);
    const sqrMag = b.sqrMagnitude();
    return sqrMag === 0 ? Vector3.zero() : b.multiply(dot / sqrMag);
  }
  static projectOnPlane(a: Vector3, normal: Vector3): Vector3 { return a.subtract(Vector3.project(a, normal)); }
  static reflect(inDirection: Vector3, inNormal: Vector3): Vector3 {
    const factor = -2 * Vector3.dot(inDirection, inNormal);
    return new Vector3(factor * inNormal.x + inDirection.x, factor * inNormal.y + inDirection.y, factor * inNormal.z + inDirection.z);
  }
  static midpoint(a: Vector3, b: Vector3): Vector3 { return new Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); }
  static centroid(points: Vector3[]): Vector3 {
    if (points.length === 0) return Vector3.zero();
    const sum = points.reduce((acc, p) => acc.add(p), Vector3.zero());
    return sum.divide(points.length);
  }
  static slerp(a: Vector3, b: Vector3, t: number): Vector3 {
    const dot = Vector3.dot(a.normalize(), b.normalize());
    const theta = Math.acos(Math.min(1, Math.max(-1, dot)));
    if (theta < 0.001) return Vector3.lerp(a, b, t);
    const sinTheta = Math.sin(theta);
    const w1 = Math.sin((1 - t) * theta) / sinTheta;
    const w2 = Math.sin(t * theta) / sinTheta;
    return a.normalize().multiply(w1).add(b.normalize().multiply(w2));
  }
  static smoothDamp(current: Vector3, target: Vector3, velocity: Vector3, smoothTime: number, maxSpeed: number = Infinity, deltaTime: number = 0.02): { position: Vector3; velocity: Vector3 } {
    smoothTime = Math.max(0.0001, smoothTime);
    const omega = 2 / smoothTime;
    const x = omega * deltaTime;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    let change = current.subtract(target);
    const maxChange = maxSpeed * smoothTime;
    change = change.clampMagnitude(maxChange);
    const temp = velocity.add(change.multiply(omega)).multiply(deltaTime);
    const newVelocity = velocity.subtract(temp.multiply(omega)).multiply(exp);
    const newPosition = target.add(change.add(temp)).multiply(exp);
    return { position: newPosition, velocity: newVelocity };
  }

  add(other: Vector3): Vector3 { return new Vector3(this.x + other.x, this.y + other.y, this.z + other.z); }
  subtract(other: Vector3): Vector3 { return new Vector3(this.x - other.x, this.y - other.y, this.z - other.z); }
  multiply(scalar: number): Vector3 { return new Vector3(this.x * scalar, this.y * scalar, this.z * scalar); }
  divide(scalar: number): Vector3 { return new Vector3(this.x / scalar, this.y / scalar, this.z / scalar); }
  negate(): Vector3 { return new Vector3(-this.x, -this.y, -this.z); }
  normalize(): Vector3 { const mag = this.magnitude(); return mag === 0 ? Vector3.zero() : this.divide(mag); }
  magnitude(): number { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
  sqrMagnitude(): number { return this.x * this.x + this.y * this.y + this.z * this.z; }
  dot(other: Vector3): number { return this.x * other.x + this.y * other.y + this.z * other.z; }
  cross(other: Vector3): Vector3 { return Vector3.cross(this, other); }
  distanceTo(other: Vector3): number { return this.subtract(other).magnitude(); }
  distanceSquaredTo(other: Vector3): number { return this.subtract(other).sqrMagnitude(); }
  equals(other: Vector3, epsilon: number = 0.0001): boolean { return Math.abs(this.x - other.x) < epsilon && Math.abs(this.y - other.y) < epsilon && Math.abs(this.z - other.z) < epsilon; }
  clone(): Vector3 { return new Vector3(this.x, this.y, this.z); }
  toArray(): number[] { return [this.x, this.y, this.z]; }
  toObject(): { x: number; y: number; z: number } { return { x: this.x, y: this.y, z: this.z }; }
  toString(): string { return `(${this.x}, ${this.y}, ${this.z})`; }
  set(x: number, y: number, z: number): void { this.x = x; this.y = y; this.z = z; }
  setX(x: number): void { this.x = x; }
  setY(y: number): void { this.y = y; }
  setZ(z: number): void { this.z = z; }
  addInPlace(other: Vector3): void { this.x += other.x; this.y += other.y; this.z += other.z; }
  subtractInPlace(other: Vector3): void { this.x -= other.x; this.y -= other.y; this.z -= other.z; }
  multiplyInPlace(scalar: number): void { this.x *= scalar; this.y *= scalar; this.z *= scalar; }
  divideInPlace(scalar: number): void { this.x /= scalar; this.y /= scalar; this.z /= scalar; }
  normalizeInPlace(): void { const mag = this.magnitude(); if (mag > 0) { this.x /= mag; this.y /= mag; this.z /= mag; } }
  negateInPlace(): void { this.x = -this.x; this.y = -this.y; this.z = -this.z; }
  clampMagnitude(max: number): Vector3 { const currentMag = this.magnitude(); if (currentMag > max && currentMag > 0) { return this.normalize().multiply(max); } return this.clone(); }
  clamp(min: Vector3, max: Vector3): Vector3 { return new Vector3(Math.max(min.x, Math.min(max.x, this.x)), Math.max(min.y, Math.min(max.y, this.y)), Math.max(min.z, Math.min(max.z, this.z))); }
  toVector2(): Vector2 { return new Vector2(this.x, this.y); }
  static fromVector2(v: Vector2, z: number = 0): Vector3 { return new Vector3(v.x, v.y, z); }
}

export class Matrix3x3 {
  constructor(public elements: number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1]) {}

  static identity(): Matrix3x3 { return new Matrix3x3([1, 0, 0, 0, 1, 0, 0, 0, 1]); }
  static zero(): Matrix3x3 { return new Matrix3x3([0, 0, 0, 0, 0, 0, 0, 0, 0]); }
  static fromArray(array: number[]): Matrix3x3 { return new Matrix3x3(array); }
  static rotation(angle: number): Matrix3x3 { const cos = Math.cos(angle); const sin = Math.sin(angle); return new Matrix3x3([cos, -sin, 0, sin, cos, 0, 0, 0, 1]); }
  static translation(x: number, y: number): Matrix3x3 { return new Matrix3x3([1, 0, x, 0, 1, y, 0, 0, 1]); }
  static scale(x: number, y: number): Matrix3x3 { return new Matrix3x3([x, 0, 0, 0, y, 0, 0, 0, 1]); }
  static shear(x: number, y: number): Matrix3x3 { return new Matrix3x3([1, x, 0, y, 1, 0, 0, 0, 1]); }
  static multiply(a: Matrix3x3, b: Matrix3x3): Matrix3x3 {
    const result = new Array(9).fill(0);
    for (let i = 0; i < 3; i++) {
      for (let j =  0; j < 3; j++) {
        result[i * 3 + j] = a.elements[i * 3] * b.elements[j] + a.elements[i * 3 + 1] * b.elements[3 + j] + a.elements[i * 3 + 2] * b.elements[6 + j];
      }
    }
    return new Matrix3x3(result);
  }

  multiply(other: Matrix3x3): Matrix3x3 { return Matrix3x3.multiply(this, other); }
  determinant(): number { const e = this.elements; return e[0] * (e[4] * e[8] - e[5] * e[7]) - e[1] * (e[3] * e[8] - e[5] * e[6]) + e[2] * (e[3] * e[7] - e[4] * e[6]); }
  inverse(): Matrix3x3 | null {
    const det = this.determinant();
    if (det === 0) return null;
    const e = this.elements;
    const inv = new Array(9).fill(0);
    inv[0] = (e[4] * e[8] - e[5] * e[7]) / det;
    inv[1] = (e[2] * e[7] - e[1] * e[8]) / det;
    inv[2] = (e[1] * e[5] - e[2] * e[4]) / det;
    inv[3] = (e[5] * e[6] - e[3] * e[8]) / det;
    inv[4] = (e[0] * e[8] - e[2] * e[6]) / det;
    inv[5] = (e[2] * e[3] - e[0] * e[5]) / det;
    inv[6] = (e[3] * e[7] - e[4] * e[6]) / det;
    inv[7] = (e[1] * e[6] - e[0] * e[7]) / det;
    inv[8] = (e[0] * e[4] - e[1] * e[3]) / det;
    return new Matrix3x3(inv);
  }
  transpose(): Matrix3x3 {
    const e = this.elements;
    return new Matrix3x3([e[0], e[3], e[6], e[1], e[4], e[7], e[2], e[5], e[8]]);
  }
  transformPoint(v: Vector2): Vector2 { const e = this.elements; return new Vector2(e[0] * v.x + e[1] * v.y + e[2], e[3] * v.x + e[4] * v.y + e[5]); }
  transformVector(v: Vector2): Vector2 { const e = this.elements; return new Vector2(e[0] * v.x + e[1] * v.y, e[3] * v.x + e[4] * v.y); }
  clone(): Matrix3x3 { return new Matrix3x3([...this.elements]); }
  equals(other: Matrix3x3, epsilon: number = 0.0001): boolean { return this.elements.every((e, i) => Math.abs(e - other.elements[i]) < epsilon); }
  toString(): string { return `Matrix3x3(${this.elements.join(", ")})`; }
  toArray(): number[] { return [...this.elements]; }
}

export class Matrix4x4 {
  constructor(public elements: number[] = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]) {}

  static identity(): Matrix4x4 { return new Matrix4x4([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }
  static zero(): Matrix4x4 { return new Matrix4x4(new Array(16).fill(0)); }
  static translation(x: number, y: number, z: number): Matrix4x4 { return new Matrix4x4([1,0,0,x, 0,1,0,y, 0,0,1,z, 0,0,0,1]); }
  static scale(x: number, y: number, z: number): Matrix4x4 { return new Matrix4x4([x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1]); }
  static rotationX(angle: number): Matrix4x4 { const c = Math.cos(angle); const s = Math.sin(angle); return new Matrix4x4([1,0,0,0, 0,c,-s,0, 0,s,c,0, 0,0,0,1]); }
  static rotationY(angle: number): Matrix4x4 { const c = Math.cos(angle); const s = Math.sin(angle); return new Matrix4x4([c,0,s,0, 0,1,0,0, -s,0,c,0, 0,0,0,1]); }
  static rotationZ(angle: number): Matrix4x4 { const c = Math.cos(angle); const s = Math.sin(angle); return new Matrix4x4([c,-s,0,0, s,c,0,0, 0,0,1,0, 0,0,0,1]); }
  static perspective(fov: number, aspect: number, near: number, far: number): Matrix4x4 {
    const f = 1 / Math.tan(fov / 2);
    const rangeInv = 1 / (near - far);
    return new Matrix4x4([f/aspect,0,0,0, 0,f,0,0, 0,0,(near+far)*rangeInv,-1, 0,0,2*near*far*rangeInv,0]);
  }
  static orthographic(left: number, right: number, bottom: number, top: number, near: number, far: number): Matrix4x4 {
    const w = 1 / (right - left);
    const h = 1 / (top - bottom);
    const d = 1 / (far - near);
    return new Matrix4x4([2*w,0,0,-(right+left)*w, 0,2*h,0,-(top+bottom)*h, 0,0,-2*d,-(far+near)*d, 0,0,0,1]);
  }
  static lookAt(eye: Vector3, target: Vector3, up: Vector3): Matrix4x4 {
    const z = eye.subtract(target).normalize();
    const x = Vector3.cross(up, z).normalize();
    const y = Vector3.cross(z, x);
    return new Matrix4x4([
      x.x, x.y, x.z, -x.dot(eye),
      y.x, y.y, y.z, -y.dot(eye),
      z.x, z.y, z.z, -z.dot(eye),
      0, 0, 0, 1,
    ]);
  }
  static multiply(a: Matrix4x4, b: Matrix4x4): Matrix4x4 {
    const result = new Array(16).fill(0);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          sum += a.elements[i * 4 + k] * b.elements[k * 4 + j];
        }
        result[i * 4 + j] = sum;
      }
    }
    return new Matrix4x4(result);
  }

  multiply(other: Matrix4x4): Matrix4x4 { return Matrix4x4.multiply(this, other); }
  transpose(): Matrix4x4 {
    const e = this.elements;
    return new Matrix4x4([e[0],e[4],e[8],e[12], e[1],e[5],e[9],e[13], e[2],e[6],e[10],e[14], e[3],e[7],e[11],e[15]]);
  }
  determinant(): number {
    const e = this.elements;
    const cofactor = (i: number): number => {
      const sub = [];
      for (let r = 0; r < 4; r++) { if (r === 0) continue; for (let c = 0; c < 4; c++) { if (c === i) continue; sub.push(e[r * 4 + c]); } }
      const [a,b,c,d,f,g,h,i2,j,k,l] = sub;
      return a*(k*f-b*j) - b*(i2*f-c*j) + c*(h*f-d*j) - d*(g*f-b*j);
    };
    return e[0]*cofactor(0) - e[1]*cofactor(1) + e[2]*cofactor(2) - e[3]*cofactor(3);
  }
  transformPoint(v: Vector3): Vector3 {
    const e = this.elements;
    return new Vector3(
      e[0]*v.x + e[1]*v.y + e[2]*v.z + e[3],
      e[4]*v.x + e[5]*v.y + e[6]*v.z + e[7],
      e[8]*v.x + e[9]*v.y + e[10]*v.z + e[11],
    );
  }
  transformVector(v: Vector3): Vector3 {
    const e = this.elements;
    return new Vector3(
      e[0]*v.x + e[1]*v.y + e[2]*v.z,
      e[4]*v.x + e[5]*v.y + e[6]*v.z,
      e[8]*v.x + e[9]*v.y + e[10]*v.z,
    );
  }
  clone(): Matrix4x4 { return new Matrix4x4([...this.elements]); }
  equals(other: Matrix4x4, epsilon: number = 0.0001): boolean { return this.elements.every((e, i) => Math.abs(e - other.elements[i]) < epsilon); }
  toString(): string { return `Matrix4x4(${this.elements.join(", ")})`; }
  toArray(): number[] { return [...this.elements]; }
}

export class Quaternion {
  constructor(public x: number = 0, public y: number = 0, public z: number = 0, public w: number = 1) {}

  static identity(): Quaternion { return new Quaternion(0, 0, 0, 1); }
  static fromAxisAngle(axis: Vector3, angle: number): Quaternion {
    const halfAngle = angle / 2;
    const sin = Math.sin(halfAngle);
    const normalized = axis.normalize();
    return new Quaternion(normalized.x * sin, normalized.y * sin, normalized.z * sin, Math.cos(halfAngle));
  }
  static fromEuler(x: number, y: number, z: number): Quaternion {
    const cx = Math.cos(x / 2); const sx = Math.sin(x / 2);
    const cy = Math.cos(y / 2); const sy = Math.sin(y / 2);
    const cz = Math.cos(z / 2); const sz = Math.sin(z / 2);
    return new Quaternion(
      sx * cy * cz + cx * sy * sz,
      cx * sy * cz - sx * cy * sz,
      sx * sy * cz + cx * cy * sz,
      cx * cy * cz - sx * sy * sz,
    );
  }
  static fromMatrix(m: Matrix4x4): Quaternion {
    const e = m.elements;
    const trace = e[0] + e[5] + e[10];
    if (trace > 0) {
      const s = Math.sqrt(trace + 1) * 2;
      return new Quaternion((e[6] - e[9]) / s, (e[8] - e[2]) / s, (e[1] - e[4]) / s, 0.25 * s);
    }
    return Quaternion.identity();
  }
  static lookRotation(forward: Vector3, up: Vector3): Quaternion {
    const f = forward.normalize();
    const r = Vector3.cross(up, f).normalize();
    const u = Vector3.cross(f, r);
    return Quaternion.fromMatrix(new Matrix4x4([
      r.x, r.y, r.z, 0,
      u.x, u.y, u.z, 0,
      f.x, f.y, f.z, 0,
      0, 0, 0, 1,
    ]));
  }
  static slerp(a: Quaternion, b: Quaternion, t: number): Quaternion {
    let dot = a.dot(b);
    if (dot < 0) { dot = -dot; b = b.negate(); }
    if (dot > 0.9995) return Quaternion.lerp(a, b, t).normalize();
    const theta = Math.acos(dot);
    const sinTheta = Math.sin(theta);
    const w1 = Math.sin((1 - t) * theta) / sinTheta;
    const w2 = Math.sin(t * theta) / sinTheta;
    return a.multiply(w1).add(b.multiply(w2));
  }
  static lerp(a: Quaternion, b: Quaternion, t: number): Quaternion {
    return new Quaternion(
      a.x + (b.x - a.x) * t,
      a.y + (b.y - a.y) * t,
      a.z + (b.z - a.z) * t,
      a.w + (b.w - a.w) * t,
    );
  }
  static dot(a: Quaternion, b: Quaternion): number { return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w; }
  static angle(a: Quaternion, b: Quaternion): number {
    const dot = Quaternion.dot(a, b);
    return Math.acos(Math.min(1, Math.abs(dot))) * 2;
  }
  static between(a: Vector3, b: Vector3): Quaternion {
    const cross = Vector3.cross(a, b);
    const dot = Vector3.dot(a, b);
    const w = Math.sqrt(a.sqrMagnitude() * b.sqrMagnitude()) + dot;
    return new Quaternion(cross.x, cross.y, cross.z, w).normalize();
  }

  add(other: Quaternion): Quaternion { return new Quaternion(this.x + other.x, this.y + other.y, this.z + other.z, this.w + other.w); }
  multiply(scalar: number): Quaternion { return new Quaternion(this.x * scalar, this.y * scalar, this.z * scalar, this.w * scalar); }
  multiplyQuaternion(other: Quaternion): Quaternion {
    return new Quaternion(
      this.w * other.x + this.x * other.w + this.y * other.z - this.z * other.y,
      this.w * other.y - this.x * other.z + this.y * other.w + this.z * other.x,
      this.w * other.z + this.x * other.y - this.y * other.x + this.z * other.w,
      this.w * other.w - this.x * other.x - this.y * other.y - this.z * other.z,
    );
  }
  negate(): Quaternion { return new Quaternion(-this.x, -this.y, -this.z, -this.w); }
  conjugate(): Quaternion { return new Quaternion(-this.x, -this.y, -this.z, this.w); }
  inverse(): Quaternion { const mag = this.sqrMagnitude(); return mag === 0 ? Quaternion.identity() : this.conjugate().divide(mag); }
  normalize(): Quaternion { const mag = this.magnitude(); return mag === 0 ? Quaternion.identity() : this.divide(mag); }
  magnitude(): number { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w); }
  sqrMagnitude(): number { return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w; }
  dot(other: Quaternion): number { return this.x * other.x + this.y * other.y + this.z * other.z + this.w * other.w; }
  divide(scalar: number): Quaternion { return new Quaternion(this.x / scalar, this.y / scalar, this.z / scalar, this.w / scalar); }
  toEuler(): { x: number; y: number; z: number } {
    const sinr_cosp = 2 * (this.w * this.x + this.y * this.z);
    const cosr_cosp = 1 - 2 * (this.x * this.x + this.y * this.y);
    const x = Math.atan2(sinr_cosp, cosr_cosp);
    const sinp = 2 * (this.w * this.y - this.z * this.x);
    const y = Math.abs(sinp) >= 1 ? Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp);
    const siny_cosp = 2 * (this.w * this.z + this.x * this.y);
    const cosy_cosp = 1 - 2 * (this.y * this.y + this.z * this.z);
    const z = Math.atan2(siny_cosp, cosy_cosp);
    return { x, y, z };
  }
  toAxisAngle(): { axis: Vector3; angle: number } {
    const w = Math.min(1, Math.max(-1, this.w));
    const angle = 2 * Math.acos(w);
    const s = Math.sqrt(1 - w * w);
    const axis = s < 0.0001 ? new Vector3(1, 0, 0) : new Vector3(this.x / s, this.y / s, this.z / s);
    return { axis, angle };
  }
  rotateVector(v: Vector3): Vector3 {
    const qv = new Quaternion(v.x, v.y, v.z, 0);
    const result = this.multiplyQuaternion(qv).multiplyQuaternion(this.conjugate());
    return new Vector3(result.x, result.y, result.z);
  }
  clone(): Quaternion { return new Quaternion(this.x, this.y, this.z, this.w); }
  equals(other: Quaternion, epsilon: number = 0.0001): boolean {
    return Math.abs(this.x - other.x) < epsilon && Math.abs(this.y - other.y) < epsilon && Math.abs(this.z - other.z) < epsilon && Math.abs(this.w - other.w) < epsilon;
  }
  toString(): string { return `Quaternion(${this.x}, ${this.y}, ${this.z}, ${this.w})`; }
  toArray(): number[] { return [this.x, this.y, this.z, this.w]; }
}

export class Rectangle {
  constructor(public x: number = 0, public y: number = 0, public width: number = 0, public height: number = 0) {}

  static zero(): Rectangle { return new Rectangle(0, 0, 0, 0); }
  static fromPoints(min: Vector2, max: Vector2): Rectangle { return new Rectangle(min.x, min.y, max.x - min.x, max.y - min.y); }
  static fromCenter(center: Vector2, width: number, height: number): Rectangle { return new Rectangle(center.x - width / 2, center.y - height / 2, width, height); }
  static fromArray(array: number[]): Rectangle { return new Rectangle(array[0] ?? 0, array[1] ?? 0, array[2] ?? 0, array[3] ?? 0); }

  get left(): number { return this.x; }
  get top(): number { return this.y; }
  get right(): number { return this.x + this.width; }
  get bottom(): number { return this.y + this.height; }
  get centerX(): number { return this.x + this.width / 2; }
  get centerY(): number { return this.y + this.height / 2; }
  get center(): Vector2 { return new Vector2(this.centerX, this.centerY); }
  get topLeft(): Vector2 { return new Vector2(this.left, this.top); }
  get topRight(): Vector2 { return new Vector2(this.right, this.top); }
  get bottomLeft(): Vector2 { return new Vector2(this.left, this.bottom); }
  get bottomRight(): Vector2 { return new Vector2(this.right, this.bottom); }
  get size(): Vector2 { return new Vector2(this.width, this.height); }
  get area(): number { return this.width * this.height; }
  get perimeter(): number { return 2 * (this.width + this.height); }
  get isEmpty(): boolean { return this.width <= 0 || this.height <= 0; }

  contains(point: Vector2): boolean { return point.x >= this.left && point.x <= this.right && point.y >= this.top && point.y <= this.bottom; }
  containsRect(other: Rectangle): boolean { return this.left <= other.left && this.right >= other.right && this.top <= other.top && this.bottom >= other.bottom; }
  intersects(other: Rectangle): boolean { return this.left < other.right && this.right > other.left && this.top < other.bottom && this.bottom > other.top; }
  intersection(other: Rectangle): Rectangle {
    const left = Math.max(this.left, other.left);
    const top = Math.max(this.top, other.top);
    const right = Math.min(this.right, other.right);
    const bottom = Math.min(this.bottom, other.bottom);
    if (right <= left || bottom <= top) return Rectangle.zero();
    return new Rectangle(left, top, right - left, bottom - top);
  }
  union(other: Rectangle): Rectangle {
    const left = Math.min(this.left, other.left);
    const top = Math.min(this.top, other.top);
    const right = Math.max(this.right, other.right);
    const bottom = Math.max(this.bottom, other.bottom);
    return new Rectangle(left, top, right - left, bottom - top);
  }
  inflate(dx: number, dy: number): Rectangle { return new Rectangle(this.x - dx, this.y - dy, this.width + 2 * dx, this.height + 2 * dy); }
  deflate(dx: number, dy: number): Rectangle { return new Rectangle(this.x + dx, this.y + dy, Math.max(0, this.width - 2 * dx), Math.max(0, this.height - 2 * dy)); }
  offset(dx: number, dy: number): Rectangle { return new Rectangle(this.x + dx, this.y + dy, this.width, this.height); }
  moveTo(x: number, y: number): Rectangle { return new Rectangle(x, y, this.width, this.height); }
  resize(width: number, height: number): Rectangle { return new Rectangle(this.x, this.y, width, height); }
  scale(sx: number, sy: number = sx): Rectangle { return new Rectangle(this.x * sx, this.y * sy, this.width * sx, this.height * sy); }
  normalize(): Rectangle {
    let { x, y, width, height } = this;
    if (width < 0) { x += width; width = -width; }
    if (height < 0) { y += height; height = -height; }
    return new Rectangle(x, y, width, height);
  }
  clone(): Rectangle { return new Rectangle(this.x, this.y, this.width, this.height); }
  equals(other: Rectangle, epsilon: number = 0.0001): boolean { return Math.abs(this.x - other.x) < epsilon && Math.abs(this.y - other.y) < epsilon && Math.abs(this.width - other.width) < epsilon && Math.abs(this.height - other.height) < epsilon; }
  toString(): string { return `Rectangle(${this.x}, ${this.y}, ${this.width}, ${this.height})`; }
  toArray(): number[] { return [this.x, this.y, this.width, this.height]; }
  toObject(): { x: number; y: number; width: number; height: number } { return { x: this.x, y: this.y, width: this.width, height: this.height }; }
}

export class Circle {
  constructor(public x: number = 0, public y: number = 0, public radius: number = 0) {}

  static zero(): Circle { return new Circle(0, 0, 0); }
  static fromCenter(center: Vector2, radius: number): Circle { return new Circle(center.x, center.y, radius); }
  static fromDiameter(x1: number, y1: number, x2: number, y2: number): Circle {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const r = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) / 2;
    return new Circle(cx, cy, r);
  }

  get center(): Vector2 { return new Vector2(this.x, this.y); }
  get diameter(): number { return this.radius * 2; }
  get circumference(): number { return 2 * Math.PI * this.radius; }
  get area(): number { return Math.PI * this.radius * this.radius; }

  contains(point: Vector2): boolean { return this.center.distanceTo(point) <= this.radius; }
  intersects(other: Circle): boolean { return this.center.distanceTo(other.center) <= this.radius + other.radius; }
  containsCircle(other: Circle): boolean { return this.center.distanceTo(other.center) + other.radius <= this.radius; }
  distanceTo(point: Vector2): number { return Math.max(0, this.center.distanceTo(point) - this.radius); }
  closestPoint(point: Vector2): Vector2 {
    const direction = point.subtract(this.center);
    const dist = direction.magnitude();
    if (dist <= this.radius) return point.clone();
    return this.center.add(direction.normalize().multiply(this.radius));
  }
  inflate(amount: number): Circle { return new Circle(this.x, this.y, Math.max(0, this.radius + amount)); }
  deflate(amount: number): Circle { return new Circle(this.x, this.y, Math.max(0, this.radius - amount)); }
  moveTo(x: number, y: number): Circle { return new Circle(x, y, this.radius); }
  scale(s: number): Circle { return new Circle(this.x, this.y, this.radius * s); }
  toRectangle(): Rectangle { return new Rectangle(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2); }
  clone(): Circle { return new Circle(this.x, this.y, this.radius); }
  equals(other: Circle, epsilon: number = 0.0001): boolean { return Math.abs(this.x - other.x) < epsilon && Math.abs(this.y - other.y) < epsilon && Math.abs(this.radius - other.radius) < epsilon; }
  toString(): string { return `Circle(${this.x}, ${this.y}, ${this.radius})`; }
}

export class Line2D {
  constructor(public start: Vector2, public end: Vector2) {}

  static fromPoints(x1: number, y1: number, x2: number, y2: number): Line2D { return new Line2D(new Vector2(x1, y1), new Vector2(x2, y2)); }
  static fromPointAndDirection(point: Vector2, direction: Vector2, length: number = 1): Line2D { return new Line2D(point, point.add(direction.normalize().multiply(length))); }

  get direction(): Vector2 { return this.end.subtract(this.start); }
  get length(): number { return this.direction.magnitude(); }
  get lengthSquared(): number { return this.direction.sqrMagnitude(); }
  get midpoint(): Vector2 { return Vector2.midpoint(this.start, this.end); }
  get angle(): number { return this.direction.angle(); }
  get isHorizontal(): boolean { return this.start.y === this.end.y; }
  get isVertical(): boolean { return this.start.x === this.end.x; }

  contains(point: Vector2, epsilon: number = 0.0001): boolean {
    const d1 = point.subtract(this.start).magnitude();
    const d2 = point.subtract(this.end).magnitude();
    const lineLen = this.length;
    return d1 + d2 <= lineLen + epsilon;
  }
  distanceTo(point: Vector2): number {
    const dir = this.direction;
    const len = dir.sqrMagnitude();
    if (len === 0) return point.distanceTo(this.start);
    const t = Math.max(0, Math.min(1, point.subtract(this.start).dot(dir) / len));
    const projection = this.start.add(dir.multiply(t));
    return point.distanceTo(projection);
  }
  closestPoint(point: Vector2): Vector2 {
    const dir = this.direction;
    const len = dir.sqrMagnitude();
    if (len === 0) return this.start.clone();
    const t = Math.max(0, Math.min(1, point.subtract(this.start).dot(dir) / len));
    return this.start.add(dir.multiply(t));
  }
  intersects(other: Line2D): boolean { return this.intersectionPoint(other) !== null; }
  intersectionPoint(other: Line2D): Vector2 | null {
    const r = this.direction;
    const s = other.direction;
    const rxs = r.cross(s);
    if (Math.abs(rxs) < 0.0001) return null;
    const qp = other.start.subtract(this.start);
    const t = qp.cross(s) / rxs;
    const u = qp.cross(r) / rxs;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return this.start.add(r.multiply(t));
  }
  parallelTo(other: Line2D, epsilon: number = 0.0001): boolean { return Math.abs(this.direction.cross(other.direction)) < epsilon; }
  perpendicularTo(other: Line2D, epsilon: number = 0.0001): boolean { return Math.abs(this.direction.dot(other.direction)) < epsilon; }
  reverse(): Line2D { return new Line2D(this.end, this.start); }
  translate(dx: number, dy: number): Line2D { return new Line2D(this.start.add(new Vector2(dx, dy)), this.end.add(new Vector2(dx, dy))); }
  scale(factor: number): Line2D { return new Line2D(this.start, this.start.add(this.direction.multiply(factor))); }
  split(t: number): [Line2D, Line2D] {
    const mid = this.start.add(this.direction.multiply(t));
    return [new Line2D(this.start, mid), new Line2D(mid, this.end)];
  }
  clone(): Line2D { return new Line2D(this.start.clone(), this.end.clone()); }
  equals(other: Line2D, epsilon: number = 0.0001): boolean { return this.start.equals(other.start, epsilon) && this.end.equals(other.end, epsilon); }
  toString(): string { return `Line2D(${this.start.toString()}, ${this.end.toString()})`; }
}

export class Statistics {
  static mean(values: number[]): number { return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length; }
  static median2(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }
  static mode2(values: number[]): number[] {
    if (values.length === 0) return [];
    const freqs = new Map<number, number>();
    for (const v of values) freqs.set(v, (freqs.get(v) ?? 0) + 1);
    const maxFreq = Math.max(...freqs.values());
    return [...freqs.entries()].filter(([, f]) => f === maxFreq).map(([v]) => v);
  }
  static range(values: number[]): number { return values.length === 0 ? 0 : Math.max(...values) - Math.min(...values); }
  static variance2(values: number[], sample: boolean = false): number {
    if (values.length < 2) return 0;
    const mean = this.mean(values);
    const sumSq = values.reduce((sum, v) => sum + (v - mean) ** 2, 0);
    return sumSq / (sample ? values.length - 1 : values.length);
  }
  static stdDev2(values: number[], sample: boolean = false): number { return Math.sqrt(this.variance2(values, sample)); }
  static min4(values: number[]): number { return values.length === 0 ? 0 : Math.min(...values); }
  static max4(values: number[]): number { return values.length === 0 ? 0 : Math.max(...values); }
  static sum3(values: number[]): number { return values.reduce((a, b) => a + b, 0); }
  static product2(values: number[]): number { return values.reduce((a, b) => a * b, 1); }
  static quartiles(values: number[]): { q1: number; q2: number; q3: number } {
    const sorted = [...values].sort((a, b) => a - b);
    if (sorted.length === 0) return { q1: 0, q2: 0, q3: 0 };
    const mid = Math.floor(sorted.length / 2);
    const lower = sorted.slice(0, mid);
    const upper = sorted.length % 2 === 0 ? sorted.slice(mid) : sorted.slice(mid + 1);
    return { q1: this.median2(lower), q2: this.median2(sorted), q3: this.median2(upper) };
  }
  static percentile2(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    if (sorted.length === 0) return 0;
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }
  static iqr(values: number[]): number { const { q1, q3 } = this.quartiles(values); return q3 - q1; }
  static outliers(values: number[], threshold: number = 1.5): number[] {
    const { q1, q3 } = this.quartiles(values);
    const iqr = q3 - q1;
    const lower = q1 - threshold * iqr;
    const upper = q3 + threshold * iqr;
    return values.filter((v) => v < lower || v > upper);
  }
  static skewness(values: number[]): number {
    if (values.length < 3) return 0;
    const mean = this.mean(values);
    const sd = this.stdDev2(values);
    if (sd === 0) return 0;
    const sum = values.reduce((s, v) => s + ((v - mean) / sd) ** 3, 0);
    return (sum / values.length) * (values.length / (values.length - 1)) ** 0.5;
  }
  static kurtosis(values: number[]): number {
    if (values.length < 4) return 0;
    const mean = this.mean(values);
    const sd = this.stdDev2(values);
    if (sd === 0) return 0;
    const sum = values.reduce((s, v) => s + ((v - mean) / sd) ** 4, 0);
    return (sum / values.length) - 3;
  }
  static covariance(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    const meanA = this.mean(a);
    const meanB = this.mean(b);
    const sum = a.reduce((s, v, i) => s + (v - meanA) * (b[i] - meanB), 0);
    return sum / a.length;
  }
  static correlation(a: number[], b: number[]): number {
    const cov = this.covariance(a, b);
    const sdA = this.stdDev2(a);
    const sdB = this.stdDev2(b);
    if (sdA === 0 || sdB === 0) return 0;
    return cov / (sdA * sdB);
  }
  static linearRegression(x: number[], y: number[]): { slope: number; intercept: number; r2: number } {
    if (x.length !== y.length || x.length === 0) return { slope: 0, intercept: 0, r2: 0 };
    const meanX = this.mean(x);
    const meanY = this.mean(y);
    const sumXY = x.reduce((s, v, i) => s + (v - meanX) * (y[i] - meanY), 0);
    const sumXX = x.reduce((s, v) => s + (v - meanX) ** 2, 0);
    const sumYY = y.reduce((s, v) => s + (v - meanY) ** 2, 0);
    const slope = sumXX === 0 ? 0 : sumXY / sumXX;
    const intercept = meanY - slope * meanX;
    const r2 = sumXX === 0 || sumYY === 0 ? 0 : (sumXY / Math.sqrt(sumXX * sumYY)) ** 2;
    return { slope, intercept, r2 };
  }
  static histogram(values: number[], bins: number = 10): Array<{ range: [number, number]; count: number; frequency: number }> {
    if (values.length === 0) return [];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binWidth = (max - min) / bins;
    if (binWidth === 0) return [{ range: [min, max], count: values.length, frequency: 1 }];
    const histogram = Array.from({ length: bins }, (_, i) => ({ range: [min + i * binWidth, min + (i + 1) * binWidth] as [number, number], count: 0, frequency: 0 }));
    for (const v of values) {
      const binIndex = Math.min(bins - 1, Math.floor((v - min) / binWidth));
      histogram[binIndex].count++;
    }
    for (const bin of histogram) { bin.frequency = bin.count / values.length; }
    return histogram;
  }
  static zScore(value: number, values: number[]): number {
    const sd = this.stdDev2(values);
    if (sd === 0) return 0;
    return (value - this.mean(values)) / sd;
  }
  static zScore2(value: number, mean: number, stdDev: number): number {
    if (stdDev === 0) return 0;
    return (value - mean) / stdDev;
  }
  static tScore(value: number, values: number[]): number { return this.zScore(value, values) * 10 + 50; }
  static standardize(values: number[]): number[] {
    const mean = this.mean(values);
    const sd = this.stdDev2(values);
    if (sd === 0) return values.map(() => 0);
    return values.map((v) => (v - mean) / sd);
  }
  static normalize(values: number[], min: number = 0, max: number = 1): number[] {
    if (values.length === 0) return [];
    const valMin = Math.min(...values);
    const valMax = Math.max(...values);
    if (valMax === valMin) return values.map(() => (min + max) / 2);
    return values.map((v) => min + ((v - valMin) / (valMax - valMin)) * (max - min));
  }
  static denormalize(values: number[], originalMin: number, originalMax: number, targetMin: number = 0, targetMax: number = 1): number[] {
    if (values.length === 0) return [];
    return values.map((v) => originalMin + ((v - targetMin) / (targetMax - targetMin)) * (originalMax - originalMin));
  }
  static coefficientOfVariation(values: number[]): number {
    const mean = this.mean(values);
    if (mean === 0) return 0;
    return this.stdDev2(values) / mean;
  }
  static movingAverage(values: number[], windowSize: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - windowSize + 1);
      const window = values.slice(start, i + 1);
      result.push(this.mean(window));
    }
    return result;
  }
  static exponentialSmoothing(values: number[], alpha: number = 0.3): number[] {
    if (values.length === 0) return [];
    const result: number[] = [values[0]];
    for (let i = 1; i < values.length; i++) {
      result.push(alpha * values[i] + (1 - alpha) * result[i - 1]);
    }
    return result;
  }
  static cumulativeSum(values: number[]): number[] {
    let sum = 0;
    return values.map((v) => (sum += v));
  }
  static cumulativeProduct(values: number[]): number[] {
    let product = 1;
    return values.map((v) => (product *= v));
  }
  static cumulativeMean(values: number[]): number[] {
    let sum = 0;
    return values.map((v, i) => (sum += v) / (i + 1));
  }
  static cumulativeMax(values: number[]): number[] {
    let max = -Infinity;
    return values.map((v) => Math.max(max, v));
  }
  static cumulativeMin(values: number[]): number[] {
    let min = Infinity;
    return values.map((v) => Math.min(min, v));
  }
  static differences(values: number[], lag: number = 1): number[] {
    return values.slice(lag).map((v, i) => v - values[i]);
  }
  static percentChange(values: number[]): number[] {
    return values.slice(1).map((v, i) => ((v - values[i]) / values[i]) * 100);
  }
  static compoundAnnualGrowthRate(start: number, end: number, years: number): number {
    if (start <= 0 || years <= 0) return 0;
    return (Math.pow(end / start, 1 / years) - 1) * 100;
  }
  static sharpeRatio(returns: number[], riskFreeRate: number = 0): number {
    const excessReturns = returns.map((r) => r - riskFreeRate);
    const sd = this.stdDev2(excessReturns);
    if (sd === 0) return 0;
    return this.mean(excessReturns) / sd;
  }
  static maxDrawdown(values: number[]): number {
    let peak = values[0] ?? 0;
    let maxDD = 0;
    for (const v of values) {
      if (v > peak) peak = v;
      const dd = (peak - v) / peak;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD * 100;
  }
  static correlations(matrix: number[][]): number[][] {
    const n = matrix.length;
    if (n === 0) return [];
    const result: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        result[i][j] = i === j ? 1 : this.correlation(matrix[i], matrix[j]);
      }
    }
    return result;
  }
  static summary(values: number[]): { count: number; min: number; max: number; mean: number; median: number; stdDev: number; variance: number; q1: number; q3: number; iqr: number; range: number; sum: number } {
    const { q1, q2, q3 } = this.quartiles(values);
    return {
      count: values.length,
      min: this.min4(values),
      max: this.max4(values),
      mean: this.mean(values),
      median: q2,
      stdDev: this.stdDev2(values),
      variance: this.variance2(values),
      q1,
      q3,
      iqr: q3 - q1,
      range: this.range(values),
      sum: this.sum3(values),
    };
  }
  static toString(values: number[]): string { return JSON.stringify(this.summary(values), null, 2); }
}
