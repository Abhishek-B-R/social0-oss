/**
 * Record a canvas animation to a video file in the browser (MediaRecorder).
 * With a source <video>, it plays the clip once from the start and records its
 * sound too (routed only into the recording, not the speakers).
 */
const audioSources = new WeakMap<HTMLVideoElement, MediaElementAudioSourceNode>();
let audioCtx: AudioContext | null = null;

/** Best supported recording type: MP4 where the browser can, else WebM. "" when none. */
export function recordingMime(): string {
  const options = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
  return options.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

function rewind(v: HTMLVideoElement) {
  v.pause();
  v.loop = false;
  v.muted = false;
  v.currentTime = 0;
}

/** Back to the silent looping preview. */
function resumePreview(v: HTMLVideoElement) {
  v.muted = true;
  v.loop = true;
  void v.play().catch(() => undefined);
}

export async function recordCanvas(o: {
  canvas: HTMLCanvasElement;
  /** The clip to play through once; null records `seconds` of `draw` instead. */
  video: HTMLVideoElement | null;
  seconds: number;
  /** Paint one frame onto `canvas`. */
  draw: (t: number) => void;
  /** File name without extension. */
  name: string;
  onProgress: (p: number | null) => void;
}): Promise<File | null> {
  const mime = recordingMime();
  if (!mime) return null;
  const stream = o.canvas.captureStream(30);
  const v = o.video;
  if (v) {
    audioCtx ??= new AudioContext();
    await audioCtx.resume();
    let source = audioSources.get(v);
    if (!source) {
      source = audioCtx.createMediaElementSource(v);
      audioSources.set(v, source);
    }
    const dest = audioCtx.createMediaStreamDestination();
    source.connect(dest);
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    rewind(v);
  }
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const duration = v ? v.duration : o.seconds;
  const started = performance.now();
  let raf = 0;
  const frame = (t: number) => {
    o.draw(t);
    const elapsed = v ? v.currentTime : (performance.now() - started) / 1000;
    o.onProgress(Math.min(1, elapsed / duration));
    if (!v && elapsed >= duration) rec.stop();
    else raf = requestAnimationFrame(frame);
  };
  const done = new Promise<File>((resolve) => {
    rec.onstop = () => {
      cancelAnimationFrame(raf);
      o.onProgress(null);
      if (v) resumePreview(v);
      const type = mime.split(";")[0];
      const ext = type === "video/mp4" ? "mp4" : "webm";
      resolve(new File([new Blob(chunks, { type })], `${o.name}.${ext}`, { type }));
    };
  });
  if (v) v.onended = () => rec.state === "recording" && rec.stop();
  rec.start(250);
  if (v) await v.play();
  raf = requestAnimationFrame(frame);
  return done;
}
