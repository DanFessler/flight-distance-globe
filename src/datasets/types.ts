/** [latDeg, lonDeg] */
export type LatLonDeg = [number, number];

/** [lat, lon] */
export type LatLonRad = [number, number];

/** [x, y, z] */
export type Position = [number, number, number];

/** [ix, ix, distance] */
export type Distance = [number, number, number];

export type PositionFunction = (coord: LatLonRad) => Position;

export type DistanceFunction = (coord1: LatLonRad, coord2: LatLonRad) => number;
