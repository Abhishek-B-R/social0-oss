import type { ImgHTMLAttributes } from "react";

type ImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
};

export default function Image({
  src,
  alt,
  width,
  height,
  fill,
  className,
  style,
  ...rest
}: ImageProps) {
  const imgStyle = fill
    ? { ...style, position: "absolute" as const, inset: 0, width: "100%", height: "100%", objectFit: "cover" as const }
    : style;

  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={imgStyle}
      loading="lazy"
      {...rest}
    />
  );
}
