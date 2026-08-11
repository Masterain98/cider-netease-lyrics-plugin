<script setup lang="ts">
import { computed, markRaw, nextTick, onMounted, onUnmounted, ref, shallowRef, type CSSProperties } from "vue";
import { getFallbackNowPlayingItem } from "../adapters/cider-host-access";
import { readCiderLanguage, resolveLocale, translate, type MessageKey } from "../i18n/settings-i18n";
import { settings } from "../stores/settings-store";

type UnknownRecord = Record<string, unknown>;
type RevealDirection = "next" | "previous";

interface CoverFrame {
  url: string;
  style: CSSProperties;
  image: HTMLImageElement;
  draw: { x: number; y: number; width: number; height: number };
}

const currentCover = shallowRef<CoverFrame>();
const locale = computed(() => resolveLocale(settings.locale, readCiderLanguage()));
const t = (key: MessageKey) => translate(locale.value, key);
const previousCover = shallowRef<CoverFrame>();
const revealDirection = ref<RevealDirection>("next");
const revealKey = ref(0);
const nativeArtworkVisible = ref(true);
const transitionCanvas = ref<HTMLCanvasElement>();
const isTransitioning = ref(false);
let pollTimer: ReturnType<typeof setInterval> | undefined;
let transitionFrame = 0;
let requestedUrl: string | undefined;
let requestToken = 0;
let disposed = false;
let navigationIntent: { direction: RevealDirection; at: number } | undefined;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function normalizeArtworkUrl(url: string): string {
  return url
    .replaceAll("{w}", "1600")
    .replaceAll("{h}", "1600")
    .replaceAll("{c}", "bb")
    .replaceAll("{f}", "jpg");
}

function artworkUrl(item: unknown): string | undefined {
  const media = record(item);
  const attributes = record(media.attributes);
  const artwork = record(attributes.artwork ?? media.artwork);
  const url = [artwork.url, media.artworkUrl, attributes.artworkUrl].find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  return url ? normalizeArtworkUrl(url) : undefined;
}

function hostArtworkUrl(): string | undefined {
  const appPlayer = record(window.CiderApp?.musicKitStore?.player);
  const appleMusicStore = record(window.__PLUGINSYS__?.Stores?.appleMusicStore);
  const directUrl = [
    appPlayer.currentArtworkUrlHiRes,
    appPlayer.currentArtworkUrl,
    appleMusicStore.currentArtworkUrlHiRes,
    appleMusicStore.currentArtworkUrl,
  ].find((value): value is string => typeof value === "string" && value.trim().length > 0);
  return directUrl ? normalizeArtworkUrl(directUrl) : undefined;
}

function isBlankLine(data: Uint8ClampedArray, size: number, index: number, vertical: boolean): boolean {
  let red = 0;
  let green = 0;
  let blue = 0;
  let alpha = 0;
  for (let offset = 0; offset < size; offset += 1) {
    const pixel = (vertical ? offset * size + index : index * size + offset) * 4;
    red += data[pixel] ?? 0;
    green += data[pixel + 1] ?? 0;
    blue += data[pixel + 2] ?? 0;
    alpha += data[pixel + 3] ?? 0;
  }
  red /= size;
  green /= size;
  blue /= size;
  alpha /= size;

  let variation = 0;
  for (let offset = 0; offset < size; offset += 1) {
    const pixel = (vertical ? offset * size + index : index * size + offset) * 4;
    variation += Math.abs((data[pixel] ?? 0) - red);
    variation += Math.abs((data[pixel + 1] ?? 0) - green);
    variation += Math.abs((data[pixel + 2] ?? 0) - blue);
  }
  variation /= size * 3;
  const luminance = red * .2126 + green * .7152 + blue * .0722;
  return alpha < 20 || (variation < 11 && (luminance < 38 || luminance > 232));
}

function acceptedCrop(leading: number, trailing: number, size: number): boolean {
  const first = leading / size;
  const last = trailing / size;
  return (first > .012 && last > .012) || first > .055 || last > .055;
}

function coverGeometry(image: HTMLImageElement): Pick<CoverFrame, "style" | "draw"> {
  const naturalWidth = Math.max(1, image.naturalWidth);
  const naturalHeight = Math.max(1, image.naturalHeight);
  let left = 0;
  let right = 1;
  let top = 0;
  let bottom = 1;

  try {
    const size = 96;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context) {
      context.drawImage(image, 0, 0, size, size);
      const pixels = context.getImageData(0, 0, size, size).data;
      const limit = Math.floor(size * .2);
      let topLines = 0;
      let bottomLines = 0;
      let leftLines = 0;
      let rightLines = 0;
      while (topLines < limit && isBlankLine(pixels, size, topLines, false)) topLines += 1;
      while (bottomLines < limit && isBlankLine(pixels, size, size - 1 - bottomLines, false)) bottomLines += 1;
      while (leftLines < limit && isBlankLine(pixels, size, leftLines, true)) leftLines += 1;
      while (rightLines < limit && isBlankLine(pixels, size, size - 1 - rightLines, true)) rightLines += 1;

      if (acceptedCrop(topLines, bottomLines, size)) {
        top = Math.min(.21, (topLines + 1) / size);
        bottom = Math.max(.79, 1 - (bottomLines + 1) / size);
      }
      if (acceptedCrop(leftLines, rightLines, size)) {
        left = Math.min(.21, (leftLines + 1) / size);
        right = Math.max(.79, 1 - (rightLines + 1) / size);
      }
    }
  } catch {
    // Cross-origin artwork can still be displayed; only pixel-edge cropping is skipped.
  }

  const contentWidth = naturalWidth * Math.max(.58, right - left);
  const contentHeight = naturalHeight * Math.max(.58, bottom - top);
  const scale = Math.max(1 / contentWidth, 1 / contentHeight);
  const centerX = naturalWidth * (left + right) / 2;
  const centerY = naturalHeight * (top + bottom) / 2;
  const draw = {
    width: naturalWidth * scale,
    height: naturalHeight * scale,
    x: 0.5 - centerX * scale,
    y: 0.5 - centerY * scale,
  };
  return {
    draw,
    style: {
      width: `${draw.width * 100}%`,
      height: `${draw.height * 100}%`,
      left: `${draw.x * 100}%`,
      top: `${draw.y * 100}%`,
    },
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function drawCover(context: CanvasRenderingContext2D, frame: CoverFrame, size: number) {
  context.drawImage(
    frame.image,
    frame.draw.x * size,
    frame.draw.y * size,
    frame.draw.width * size,
    frame.draw.height * size,
  );
}

function makeTexture(frame: CoverFrame, size: number): HTMLCanvasElement {
  const texture = document.createElement("canvas");
  texture.width = size;
  texture.height = size;
  const context = texture.getContext("2d");
  if (context) {
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    drawCover(context, frame, size);
  }
  return texture;
}

function textureIsReadable(texture: HTMLCanvasElement): boolean {
  try {
    texture.getContext("2d", { willReadFrequently: true })?.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | undefined {
  const shader = gl.createShader(type);
  if (!shader) return undefined;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return undefined;
  }
  return shader;
}

function createLiquidRenderer(
  canvas: HTMLCanvasElement,
  oldTextureSource: HTMLCanvasElement,
  newTextureSource: HTMLCanvasElement,
  direction: RevealDirection,
): ((progress: number) => void) | undefined {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: true,
    depth: false,
    preserveDrawingBuffer: false,
    premultipliedAlpha: false,
  });
  if (!gl) return undefined;
  const textureContext: WebGLRenderingContext = gl;

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
      v_uv = a_position * .5 + .5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_old;
    uniform sampler2D u_new;
    uniform float u_progress;
    uniform float u_direction;

    vec2 vortex(vec2 uv, vec2 center, float spin, float energy) {
      vec2 delta = uv - center;
      float influence = exp(-(delta.x * delta.x / .022 + delta.y * delta.y / .040)) * energy;
      return vec2(
        -delta.y * .66 * spin + delta.x * .18,
         delta.x * .58 * spin + delta.y * .12
      ) * influence;
    }

    void main() {
      vec2 uv = v_uv;
      float eased = .5 - cos(u_progress * 3.14159265) * .5;
      float energy = pow(max(0.0, sin(u_progress * 3.14159265)), .72);
      float travellingWave = energy * (
        sin(uv.y * 6.597 + u_progress * 2.4) * .040
        + sin(uv.y * 16.965 - u_progress * 4.1) * .018
        + sin(uv.y * 28.903 + .8) * .009
      );
      float front = u_direction > 0.0
        ? 1.0 - eased + travellingWave
        : eased - travellingWave;
      float signedDistance = u_direction > 0.0 ? uv.x - front : front - uv.x;
      float reveal = smoothstep(-.025, .020, signedDistance);
      float distanceToFront = abs(uv.x - front);
      float lens = exp(-(distanceToFront * distanceToFront) / .055) * energy;

      vec2 sampleUv = uv;
      sampleUv.x += u_direction * lens * (.092 + sin(uv.y * 15.8 + u_progress * 7.2) * .030);
      sampleUv.y += lens * sin(uv.y * 21.4 - u_progress * 8.6) * .025;
      sampleUv += vortex(uv, vec2(front + u_direction * .100, .21 + sin(u_progress * 4.2) * .035), u_direction, energy);
      sampleUv += vortex(uv, vec2(front + u_direction * .118, .50 + sin(u_progress * 4.2 + 2.1) * .035), -u_direction, energy);
      sampleUv += vortex(uv, vec2(front + u_direction * .136, .79 + sin(u_progress * 4.2 + 4.2) * .035), u_direction, energy);
      sampleUv = clamp(sampleUv, vec2(.006), vec2(.994));

      vec2 chroma = vec2(u_direction * lens * .006, 0.0);
      vec4 oldColor = texture2D(u_old, uv);
      vec4 newCenter = texture2D(u_new, sampleUv);
      vec4 newColor = vec4(
        texture2D(u_new, clamp(sampleUv + chroma, vec2(.006), vec2(.994))).r,
        newCenter.g,
        texture2D(u_new, clamp(sampleUv - chroma, vec2(.006), vec2(.994))).b,
        1.0
      );
      float glassHighlight = exp(-(distanceToFront * distanceToFront) / .00055) * energy * .18;
      vec3 color = mix(oldColor.rgb, newColor.rgb, reveal);
      color += glassHighlight * vec3(.76, .88, 1.0);
      gl_FragColor = vec4(color, 1.0);
    }
  `);
  if (!vertexShader || !fragmentShader) return undefined;

  const program = gl.createProgram();
  if (!program) return undefined;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return undefined;
  gl.useProgram(program);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const positionLocation = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);

  function uploadTexture(source: HTMLCanvasElement, unit: number): WebGLTexture | undefined {
    const texture = textureContext.createTexture();
    if (!texture) return undefined;
    textureContext.activeTexture(unit);
    textureContext.bindTexture(textureContext.TEXTURE_2D, texture);
    textureContext.texParameteri(textureContext.TEXTURE_2D, textureContext.TEXTURE_WRAP_S, textureContext.CLAMP_TO_EDGE);
    textureContext.texParameteri(textureContext.TEXTURE_2D, textureContext.TEXTURE_WRAP_T, textureContext.CLAMP_TO_EDGE);
    textureContext.texParameteri(textureContext.TEXTURE_2D, textureContext.TEXTURE_MIN_FILTER, textureContext.LINEAR);
    textureContext.texParameteri(textureContext.TEXTURE_2D, textureContext.TEXTURE_MAG_FILTER, textureContext.LINEAR);
    textureContext.texImage2D(textureContext.TEXTURE_2D, 0, textureContext.RGBA, textureContext.RGBA, textureContext.UNSIGNED_BYTE, source);
    return texture;
  }

  try {
    if (!uploadTexture(oldTextureSource, gl.TEXTURE0) || !uploadTexture(newTextureSource, gl.TEXTURE1)) return undefined;
  } catch {
    return undefined;
  }

  gl.uniform1i(gl.getUniformLocation(program, "u_old"), 0);
  gl.uniform1i(gl.getUniformLocation(program, "u_new"), 1);
  gl.uniform1f(gl.getUniformLocation(program, "u_direction"), direction === "next" ? 1 : -1);
  const progressLocation = gl.getUniformLocation(program, "u_progress");
  gl.viewport(0, 0, canvas.width, canvas.height);

  return (progress: number) => {
    gl.uniform1f(progressLocation, progress);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };
}

/**
 * Draw a travelling refractive field. The destination grid stays fixed while
 * the sampled pixels bend around three moving vortices, so the image behaves
 * like liquid glass instead of a clipped scalloped mask.
 */
function renderLiquidFrame(
  context: CanvasRenderingContext2D,
  oldTexture: HTMLCanvasElement,
  newTexture: HTMLCanvasElement,
  progress: number,
  direction: RevealDirection,
) {
  const size = context.canvas.width;
  const cell = 3;
  const eased = .5 - Math.cos(progress * Math.PI) / 2;
  const energy = Math.sin(progress * Math.PI) ** .72;
  const directionSign = direction === "next" ? 1 : -1;

  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  context.clearRect(0, 0, size, size);
  context.drawImage(oldTexture, 0, 0);

  for (let y = 0; y < size; y += cell) {
    const destinationHeight = Math.min(cell + 1, size - y);
    const v = (y + destinationHeight / 2) / size;
    const travellingWave = energy * (
      Math.sin(v * Math.PI * 2.1 + progress * 2.4) * .040
      + Math.sin(v * Math.PI * 5.4 - progress * 4.1) * .018
      + Math.sin(v * Math.PI * 9.2 + .8) * .009
    );
    const front = direction === "next" ? 1 - eased + travellingWave : eased - travellingWave;

    for (let x = 0; x < size; x += cell) {
      const destinationWidth = Math.min(cell + 1, size - x);
      const u = (x + destinationWidth / 2) / size;
      const coverage = direction === "next"
        ? smoothstep(front - .025, front + .020, u)
        : 1 - smoothstep(front - .020, front + .025, u);
      if (coverage <= .002) continue;

      const distanceToFront = Math.abs(u - front);
      const lens = Math.exp(-(distanceToFront * distanceToFront) / .055) * energy;
      let sampleU = u + directionSign * lens * (
        .092 + Math.sin(v * 15.8 + progress * 7.2) * .030
      );
      let sampleV = v + lens * Math.sin(v * 21.4 - progress * 8.6) * .025;

      const vortexOffsets = [-.29, 0, .28];
      for (let index = 0; index < vortexOffsets.length; index += 1) {
        const centerX = front + directionSign * (.10 + index * .018);
        const centerY = .5 + vortexOffsets[index]! + Math.sin(progress * 4.2 + index * 2.1) * .035;
        const deltaX = u - centerX;
        const deltaY = v - centerY;
        const vortex = Math.exp(-(deltaX * deltaX / .022 + deltaY * deltaY / .040)) * energy;
        const spin = (index % 2 === 0 ? 1 : -1) * directionSign;
        sampleU += (-deltaY * .62 * spin + deltaX * .18) * vortex;
        sampleV += (deltaX * .54 * spin + deltaY * .12) * vortex;
      }

      sampleU = clamp(sampleU, .012, .988);
      sampleV = clamp(sampleV, .012, .988);
      const sourceX = clamp(sampleU * size - destinationWidth / 2, 0, size - destinationWidth);
      const sourceY = clamp(sampleV * size - destinationHeight / 2, 0, size - destinationHeight);
      context.globalAlpha = coverage;
      context.drawImage(
        newTexture,
        sourceX,
        sourceY,
        destinationWidth,
        destinationHeight,
        x,
        y,
        destinationWidth,
        destinationHeight,
      );
    }

    if (energy > .05) {
      const frontX = clamp(front * size, 0, size);
      const highlightWidth = size * (.025 + energy * .025);
      const highlight = context.createLinearGradient(frontX - highlightWidth, 0, frontX + highlightWidth, 0);
      highlight.addColorStop(0, "rgb(255 255 255 / 0)");
      highlight.addColorStop(.48, `rgb(255 255 255 / ${.06 * energy})`);
      highlight.addColorStop(.60, `rgb(255 255 255 / ${.18 * energy})`);
      highlight.addColorStop(1, "rgb(255 255 255 / 0)");
      context.globalAlpha = 1;
      context.globalCompositeOperation = "screen";
      context.fillStyle = highlight;
      context.fillRect(frontX - highlightWidth, y, highlightWidth * 2, destinationHeight);
      context.globalCompositeOperation = "source-over";
    }
  }

  context.globalAlpha = 1;
}

function stopTransition() {
  if (transitionFrame) cancelAnimationFrame(transitionFrame);
  transitionFrame = 0;
}

function completeTransition() {
  stopTransition();
  previousCover.value = undefined;
  isTransitioning.value = false;
  nativeArtworkVisible.value = false;
}

function startLiquidTransition(token: number) {
  stopTransition();
  const canvas = transitionCanvas.value;
  const oldFrame = previousCover.value;
  const newFrame = currentCover.value;
  if (!canvas || !oldFrame || !newFrame || token !== requestToken) {
    completeTransition();
    return;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    completeTransition();
    return;
  }

  const size = 420;
  canvas.width = size;
  canvas.height = size;
  const oldTexture = makeTexture(oldFrame, size);
  const newTexture = makeTexture(newFrame, size);
  const webglRenderer = textureIsReadable(oldTexture) && textureIsReadable(newTexture)
    ? createLiquidRenderer(canvas, oldTexture, newTexture, revealDirection.value)
    : undefined;
  const fallbackContext = webglRenderer ? undefined : canvas.getContext("2d", { alpha: false });
  if (!webglRenderer && !fallbackContext) {
    completeTransition();
    return;
  }
  if (fallbackContext) {
    fallbackContext.imageSmoothingEnabled = true;
    fallbackContext.imageSmoothingQuality = "high";
  }
  const startedAt = performance.now();
  const duration = 1_180;

  const animate = (now: number) => {
    if (disposed || token !== requestToken) return;
    const progress = clamp((now - startedAt) / duration, 0, 1);
    if (webglRenderer) webglRenderer(progress);
    else if (fallbackContext) renderLiquidFrame(fallbackContext, oldTexture, newTexture, progress, revealDirection.value);
    if (progress < 1) {
      transitionFrame = requestAnimationFrame(animate);
    } else {
      completeTransition();
    }
  };
  transitionFrame = requestAnimationFrame(animate);
}

function finishReveal(frame: CoverFrame, direction: RevealDirection, token: number) {
  if (disposed || token !== requestToken) return;
  const hadOwnCover = Boolean(currentCover.value);
  previousCover.value = currentCover.value;
  currentCover.value = frame;
  revealDirection.value = direction;
  revealKey.value += 1;
  requestedUrl = undefined;
  if (hadOwnCover) {
    isTransitioning.value = true;
    void nextTick(() => startLiquidTransition(token));
  } else {
    nativeArtworkVisible.value = false;
  }
}

function loadCover(url: string, direction: RevealDirection, token: number, cors: boolean) {
  const image = new Image();
  image.decoding = "async";
  if (cors) image.crossOrigin = "anonymous";
  image.onload = () => {
    const geometry = coverGeometry(image);
    finishReveal({ url, image: markRaw(image), ...geometry }, direction, token);
  };
  image.onerror = () => {
    if (disposed || token !== requestToken) return;
    if (cors) {
      loadCover(url, direction, token, false);
      return;
    }
    requestedUrl = undefined;
  };
  image.src = url;
}

function transitionDirection(): RevealDirection {
  if (navigationIntent && performance.now() - navigationIntent.at < 5_000) return navigationIntent.direction;
  return "next";
}

function requestCover(url: string | undefined) {
  if (!url || url === currentCover.value?.url || url === requestedUrl) return;
  requestedUrl = url;
  requestToken += 1;
  loadCover(url, transitionDirection(), requestToken, true);
}

function syncTrackArtwork() {
  requestCover(artworkUrl(getFallbackNowPlayingItem()) ?? hostArtworkUrl());
}

function recordNavigation(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target.closest("button") : null;
  if (!target) return;
  const label = `${target.getAttribute("aria-label") ?? ""} ${target.getAttribute("title") ?? ""}`.toLocaleLowerCase();
  const previous = target.matches(".am-playback-actions > .playback-action-button:nth-child(2)") || /上一|previous|prev/.test(label);
  const next = target.matches(".am-playback-actions > .playback-action-button:nth-child(4)") || /下一|next/.test(label);
  if (previous || next) navigationIntent = { direction: previous ? "previous" : "next", at: performance.now() };
}

function recordMediaKey(event: KeyboardEvent) {
  if (event.key === "MediaTrackPrevious") navigationIntent = { direction: "previous", at: performance.now() };
  if (event.key === "MediaTrackNext") navigationIntent = { direction: "next", at: performance.now() };
}

onMounted(() => {
  document.addEventListener("click", recordNavigation, true);
  window.addEventListener("keydown", recordMediaKey, true);
  syncTrackArtwork();
  pollTimer = setInterval(syncTrackArtwork, 300);
});

onUnmounted(() => {
  disposed = true;
  stopTransition();
  requestToken += 1;
  document.removeEventListener("click", recordNavigation, true);
  window.removeEventListener("keydown", recordMediaKey, true);
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <div class="artwork-cover" role="img" :aria-label="t('player.artwork')">
    <cider-immersive-artwork v-if="nativeArtworkVisible" class="native-artwork-fallback" />
    <div v-if="previousCover" class="cover-frame cover-frame-old">
      <img class="cover-image" :src="previousCover.url" :style="previousCover.style" alt="" />
    </div>
    <div v-if="currentCover" :key="revealKey" class="cover-frame cover-frame-current" :class="{ 'cover-frame-awaiting': isTransitioning }">
      <img class="cover-image" :src="currentCover.url" :style="currentCover.style" alt="" />
    </div>
    <canvas v-if="isTransitioning" ref="transitionCanvas" class="liquid-transition-canvas" aria-hidden="true" />
  </div>
</template>

<style scoped>
.artwork-cover { position: relative; width: 100%; height: 100%; overflow: hidden; background: #0b0b0f; transition: transform 900ms cubic-bezier(.22, 1, .36, 1), filter 900ms cubic-bezier(.22, 1, .36, 1); }
.native-artwork-fallback, .cover-frame { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
.native-artwork-fallback { z-index: 0; }
.cover-frame { overflow: hidden; background: #0b0b0f; }
.cover-frame-old { z-index: 1; }
.cover-frame-current { z-index: 2; }
.cover-frame-awaiting { opacity: 0; }
.cover-image { position: absolute; display: block; max-width: none; max-height: none; user-select: none; pointer-events: none; }
.liquid-transition-canvas { position: absolute; z-index: 3; inset: 0; display: block; width: 100%; height: 100%; pointer-events: none; }
</style>
