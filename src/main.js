import "./style.css";

let canvasEl = document.createElement("canvas");
canvasEl.width = 800;
canvasEl.height = 600;

let ctx = canvasEl.getContext("2d");

document.body.appendChild(canvasEl);

ctx.fillStyle = "red";
ctx.fillRect(10, 10, 100, 100);

let numPoints = 30 ** 2;

function greatCircleDistance(a, b) {
  // Assuming points a and b have x, y, z coordinates on a sphere
  // First convert to latitude/longitude
  const radius = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);

  // Convert cartesian to spherical coordinates (latitude and longitude)
  const lat1 = Math.asin(a.z / radius);
  const lon1 = Math.atan2(a.y, a.x);
  const lat2 = Math.asin(b.z / radius);
  const lon2 = Math.atan2(b.y, b.x);

  // Haversine formula
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const havLat = Math.sin(dLat / 2) * Math.sin(dLat / 2);
  const havLon = Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const a_term = havLat + Math.cos(lat1) * Math.cos(lat2) * havLon;
  const c = 2 * Math.atan2(Math.sqrt(a_term), Math.sqrt(1 - a_term));

  return radius * c; // Distance in same units as radius
}

class Game {
  constructor() {
    this.canvas = canvasEl;
    this.ctx = ctx;
    this.interval = 1000 / 60;
    this.lastTime = 0;

    this.points = [];

    // create points distributed on the surface of a sphere
    for (let i = 0; i < numPoints; i++) {
      const phi = Math.acos(-1 + (2 * i) / numPoints);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const radius = 200;

      this.points.push({
        id: i,
        x: this.canvas.width / 2 + radius * Math.sin(phi) * Math.cos(theta),
        y: this.canvas.height / 2 + radius * Math.sin(phi) * Math.sin(theta),
        z: radius * Math.cos(phi),
      });
    }

    // create points distributed on a flat plane
    // let size = Math.sqrt(numPoints);
    // console.log(size);
    // for (let x = 0; x < size; x++) {
    //   for (let y = 0; y < size; y++) {
    //     this.points.push({
    //       id: y + x * size,
    //       x: x * 25,
    //       y: y * 25,
    //       z: 0,
    //     });
    //   }
    // }

    // randomly remove points
    const pointsToRemove = 0;
    for (let i = 0; i < pointsToRemove; i++) {
      const index = Math.floor(Math.random() * this.points.length);
      this.points.splice(index, 1);
    }
    numPoints = this.points.length;

    // record distances between all points
    for (let i = 0; i < this.points.length; i++) {
      let distances = [];
      for (let j = 0; j < this.points.length; j++) {
        distances.push({
          id: j,
          distance: Math.sqrt(
            Math.pow(this.points[i].x - this.points[j].x, 2) +
              Math.pow(this.points[i].y - this.points[j].y, 2) +
              Math.pow(this.points[i].z - this.points[j].z, 2)
          ),
          // distance: greatCircleDistance(this.points[i], this.points[j]),
        });
        this.points[i].distances = distances;
      }
    }

    // randomly distribute the points throughout 3D space
    for (let i = 0; i < numPoints; i++) {
      let point = this.points[i];
      const radius = Math.random() * 600; // Random distance from center
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(2 * Math.random() - 1);

      point.x =
        this.canvas.width / 2 + radius * Math.sin(phi) * Math.cos(theta);
      point.y =
        this.canvas.height / 2 + radius * Math.sin(phi) * Math.sin(theta);
      point.z = radius * Math.cos(phi);
    }

    console.log(this.points);
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
      let point = this.points[i];
      for (let j = 0; j < point.distances.length; j++) {
        let distanceObj = point.distances[j];
        // if (distanceObj.distance > 80) continue;
        let otherPoint = this.points[distanceObj.id];

        if (point === otherPoint) continue;

        let dx = otherPoint.x - point.x;
        let dy = otherPoint.y - point.y;
        let dz = otherPoint.z - point.z;
        let currentDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        // let currentDistance = greatCircleDistance(point, otherPoint);

        let dirX = dx / currentDistance;
        let dirY = dy / currentDistance;
        let dirZ = dz / currentDistance;

        let targetX = point.x + dirX * (currentDistance - distanceObj.distance);
        let targetY = point.y + dirY * (currentDistance - distanceObj.distance);
        let targetZ = point.z + dirZ * (currentDistance - distanceObj.distance);
        let target = { x: targetX, y: targetY, z: targetZ };

        let newPos = lerp3d(point, target, 0.001);
        point.x = newPos.x;
        point.y = newPos.y;
        point.z = newPos.z;
      }
      // find averaged origin
      let origin = { x: 0, y: 0, z: 0 };
      for (let i = 0; i < this.points.length; i++) {
        origin.x += this.points[i].x;
        origin.y += this.points[i].y;
        origin.z += this.points[i].z;
      }
      origin.x /= this.points.length;
      origin.y /= this.points.length;
      origin.z /= this.points.length;

      // rotate point around the average origin
      const dx = point.x - origin.x;
      const dz = point.z - origin.z;
      const angle = 0.001;
      point.x = origin.x + dx * Math.cos(angle) - dz * Math.sin(angle);
      point.z = origin.z + dx * Math.sin(angle) + dz * Math.cos(angle);
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
        projectedX:
          this.canvas.width / 2 + (point.x - this.canvas.width / 2) * scale,
        projectedY:
          this.canvas.height / 2 + (point.y - this.canvas.height / 2) * scale,
        scale: scale,
      };
    });

    // Sort points by z for proper rendering order
    const sortedPoints = [...projectedPoints].sort((a, b) => b.z - a.z);

    // Draw connections first
    sortedPoints.forEach((point) => {
      let distances = point.distances;
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
          let color = hsvToRgb(ratio, 1, 1);

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

function hsvToRgb(h, s, v) {
  let r, g, b;
  let i = Math.floor(h * 6);
  let f = h * 6 - i;
  let p = v * (1 - s);
  let q = v * (1 - f * s);
  let t = v * (1 - (1 - f) * s);
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
    case 5:
      [r, g, b] = [v, p, q];
      break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function lerp3d(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

let game = new Game();
game.start();
