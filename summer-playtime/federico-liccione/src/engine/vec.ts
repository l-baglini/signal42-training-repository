import type { Point3 } from './types'

export const dot = (a: Point3, b: Point3): number => a.x * b.x + a.y * b.y + a.z * b.z

export const sub = (a: Point3, b: Point3): Point3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })

export const dist = (a: Point3, b: Point3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
