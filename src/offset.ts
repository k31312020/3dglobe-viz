import type { LatLon, Vec3 } from "./types";
/**
 * Convert latitude, longitude, and optional altitude to Cartesian coordinates.
 * @param latLon Latitude and longitude in degrees, optional altitude in meters
 * @param radius Earth's radius in meters (default 6371000 m)
 * @returns Cartesian coordinates {x, y, z} in meters
 */
export function latLonToCartesian(latLon: LatLon & {alt?: number}, radius = 6371000): Vec3 {
  const { lat, lon, alt = 0 } = latLon;

  // Convert degrees to radians
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;

  const r = radius + alt;

  const x = r * Math.cos(latRad) * Math.cos(lonRad);
  const y = r * Math.cos(latRad) * Math.sin(lonRad);
  const z = r * Math.sin(latRad);

  return { x, y, z };
}


/**
 * Convert Cartesian coordinates back to latitude, longitude, and altitude.
 * @param cart Cartesian coordinates {x, y, z} in meters
 * @returns LatLon {lat, lon, alt} where lat/lon in degrees, alt in meters
 */
export function cartesianToLatLon(cart: Vec3): LatLon {
  const { x, y, z } = cart;

  const r = Math.sqrt(x * x + y * y + z * z);
  const latRad = Math.asin((z??0) / r);
  const lonRad = Math.atan2(y, x);

  const lat = (latRad * 180) / Math.PI;
  const lon = (lonRad * 180) / Math.PI;

  return { lat, lon };
}

export function polygonWinding(cart: Vec3[]): 1 | -1 {
  let sum = 0;

  for (let i = 0; i < cart.length; i++) {
    const p1 = cart[i];
    const p2 = cart[(i + 1) % cart.length];
    sum += (p2.x - p1.x) * (p2.y + p1.y);
  }

  // CCW → positive, CW → negative
  return sum > 0 ? 1 : -1;
}


export const offsetPolygon = (polygon: LatLon[], offsetDistance = 1): LatLon[] => {
    const winding = polygonWinding(polygon.map(p => latLonToCartesian(p)));
    const offsetPolygon: LatLon[] = [];
    for(let i = 0; i < (polygon.length - 1); i++) {
        const {x:x1,y:y1, z: z1} = latLonToCartesian(polygon[i]);
        const {x:x2,y:y2} = latLonToCartesian(polygon[i+1]);

        const vx = x2 - x1;
        const vy = y2 - y1;

        const magnitude = Math.sqrt(vx*vx+vy*vy);

        const normalizedNormal = {
            nx: vy/magnitude,
            ny: -vx/magnitude
        };

        const offset = {
            x:offsetDistance * normalizedNormal.nx * winding,
            y:offsetDistance * normalizedNormal.ny * winding
        }

        const {lat, lon} = cartesianToLatLon({x: x1 + offset.x, y: y1 + offset.y, z: z1});

        offsetPolygon.push({lon, lat, offset: true});
    }
    return offsetPolygon;
}