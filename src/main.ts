import "./style.css";

import * as OF from "./datasets/openflights";

function main() {
  const canvas = document.createElement("canvas");
  if (!canvas) {
    throw new Error(`document.createElement("canvas") failed`);
  }
  canvas.width = 800;
  canvas.height = 600;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error(`canvasEl.getContext("2d") failed`);
  }

  document.body.appendChild(canvas);

  ctx.fillStyle = "red";
  ctx.fillRect(10, 10, 100, 100);

  const game = new Game(canvas, ctx);
  game.start();
}

type Vec = {
  x: number;
  y: number;
  z: number;
};

type Point = {
  id: number;
  x: number;
  y: number;
  z: number;
  distances: Distance[];
};

type Distance = {
  id: number;
  distance: number;
};

class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  interval: number = 1000 / 60;
  lastTime: number = 0;
  points: Point[];

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.canvas = canvas;
    this.ctx = ctx;

    this.points = [];

    // Initialization. TODO: converge successfully without initialization with
    // real data.
    const positionFunction = OF.globePosition;
    // const positionFunction = OF.gleasonPosition;
    for (const position of OF.getPositions(positionFunction)) {
      this.points.push({
        id: this.points.length,
        x: position[0],
        y: position[1],
        z: position[2],
        distances: [],
      });
    }

    // const numPoints = openFlights.getNumAirports();

    // // uniformly distribute the points throughout a sphere
    // for (let i = 0; i < numPoints; i++) {
    //   const radius = Math.cbrt(Math.random()) * 7000; // Random distance from center
    //   const theta = Math.random() * 2 * Math.PI;
    //   const phi = Math.acos(2 * Math.random() - 1);
    //   const sinPhi = Math.sin(phi);

    //   this.points[i] = {
    //     id: i,
    //     x: radius * sinPhi * Math.cos(theta),
    //     y: radius * sinPhi * Math.sin(theta),
    //     z: radius * Math.cos(phi),
    //     distances: [],
    //   };
    // }

    // const distanceFunction = OF.globeDistance;
    const distanceFunction = OF.globeChordDistance;
    // const distanceFunction = OF.gleasonDistance;
    for (const [ix1, ix2, distance] of OF.getDistances(distanceFunction)) {
      this.points[ix1]!.distances.push({ id: ix2, distance });
      this.points[ix2]!.distances.push({ id: ix1, distance });
    }
  }

  start() {
    this.lastTime = performance.now();
    requestAnimationFrame(this.update.bind(this));
  }

  update() {
    this.simulate();
    this.render();
    requestAnimationFrame(this.update.bind(this));
  }

  simulate() {
    for (let i = 0; i < this.points.length; i++) {
      const point = this.points[i]!;
      for (let j = 0; j < point.distances.length; j++) {
        const distanceObj = point.distances[j]!;
        // if (distanceObj.distance > 80) continue;
        const otherPoint = this.points[distanceObj.id]!;

        const dx = otherPoint.x - point.x;
        const dy = otherPoint.y - point.y;
        const dz = otherPoint.z - point.z;
        const currentDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        // const currentDistance = greatCircleDistance(point, otherPoint);

        const dirX = dx / currentDistance;
        const dirY = dy / currentDistance;
        const dirZ = dz / currentDistance;

        const targetX =
          point.x + dirX * (currentDistance - distanceObj.distance);
        const targetY =
          point.y + dirY * (currentDistance - distanceObj.distance);
        const targetZ =
          point.z + dirZ * (currentDistance - distanceObj.distance);
        const target = { x: targetX, y: targetY, z: targetZ };

        const newPos = lerp3d(point, target, 0.001);
        point.x = newPos.x;
        point.y = newPos.y;
        point.z = newPos.z;
      }
    }

    // find averaged origin
    const origin = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < this.points.length; i++) {
      const point = this.points[i]!;
      origin.x += point.x;
      origin.y += point.y;
      origin.z += point.z;
    }
    origin.x /= this.points.length;
    origin.y /= this.points.length;
    origin.z /= this.points.length;

    // center and rotate the points
    for (let i = 0; i < this.points.length; i++) {
      const point = this.points[i]!;
      point.x -= origin.x;
      point.y -= origin.y;
      point.z -= origin.z;

      const angle = 0.001;
      const x = point.x;
      const z = point.z;
      point.x = x * Math.cos(angle) - z * Math.sin(angle);
      point.z = x * Math.sin(angle) + z * Math.cos(angle);
    }
  }

  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Perspective projection parameters
    const fov = 40; // Field of view in degrees
    const fovRad = (fov * Math.PI) / 180;
    const projectionDistance = this.canvas.height / (2 * Math.tan(fovRad / 2));

    // Project points to 2D with perspective
    const projectedPoints = this.points.map((point) => {
      const scale = projectionDistance / (projectionDistance + point.z);
      return {
        ...point,
        projectedX: this.canvas.width / 2 + point.x * scale,
        projectedY: this.canvas.height / 2 + point.y * scale,
        scale: scale,
      };
    });

    // Sort points by z for proper rendering order
    const sortedPoints = projectedPoints.toSorted((a, b) => b.z - a.z);

    // Draw connections first
    sortedPoints.forEach((point) => {
      const distances = point.distances;
      // distances.sort((a, b) => a.distance - b.distance);
      // distances = distances.slice(0, 10);
      distances.forEach((distanceObj) => {
        const otherPoint = projectedPoints[distanceObj.id];
        // const otherPoint = projectedPoints.find((p) => p.id === distanceObj.id);
        if (!otherPoint) return;
        // console.log("sorted", sortedPoints);

        // Calculate actual distance between points
        const dx = point.x - otherPoint.x;
        const dy = point.y - otherPoint.y;
        const dz = point.z - otherPoint.z;
        const actualDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (actualDistance > 35) return;

        if (distanceObj.id > point.id) {
          // Calculate difference ratio between actual and target distance
          const difference = actualDistance - distanceObj.distance;
          const maxDifference = 200; // Adjust this to control color intensity
          const ratio =
            Math.max(-1, Math.min(1, difference / maxDifference)) / 2 + 0.5;

          // Red when negative (too close), green when positive (too far)
          const color = hsvToRgb(ratio, 1, 1);

          const alpha = Math.max(0, Math.min(1, 1 - (point.z + 400) / 800));

          this.ctx.beginPath();
          this.ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
          this.ctx.moveTo(point.projectedX, point.projectedY);
          this.ctx.lineTo(otherPoint.projectedX, otherPoint.projectedY);
          this.ctx.stroke();
        }
      });
    });

    // Draw points on top
    // sortedPoints.forEach((point) => {
    //   const baseSize = 3;
    //   const size = Math.max(1, baseSize * point.scale);
    //   const alpha = Math.max(0.2, Math.min(1, 1 - (point.z + 400) / 800));

    //   this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    //   this.ctx.beginPath();
    //   this.ctx.arc(point.projectedX, point.projectedY, size, 0, Math.PI * 2);
    //   this.ctx.fill();
    // });
  }
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  let r, g, b;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      [r, g, b] = [v, t, p];
      break;
    case 1:
      [r, g, b] = [q, v, p];
      break;
    case 2:
      [r, g, b] = [p, v, t];
      break;
    case 3:
      [r, g, b] = [p, q, v];
      break;
    case 4:
      [r, g, b] = [t, p, v];
      break;
    default:
      [r, g, b] = [v, p, q];
      break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerp3d(a: Vec, b: Vec, t: number): Vec {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

main();
