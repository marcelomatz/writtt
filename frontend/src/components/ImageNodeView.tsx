import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';

/**
 * React NodeView for the Image extension.
 *
 * Renders:
 *   <figure style="…align…">
 *     <img src="…" alt="…" />
 *     <figcaption>…</figcaption>   ← only when data-caption is non-empty
 *   </figure>
 */
export function ImageNodeView({ node, selected }: NodeViewProps) {
  const {
    src,
    alt,
    'data-align': align,
    'data-caption': caption,
  } = node.attrs as {
    src: string;
    alt: string;
    'data-align': string;
    'data-caption': string;
  };

  // Map data-align to figure CSS styles
  const figureStyle: React.CSSProperties =
    align === 'left'
      ? { marginRight: 'auto', marginLeft: 0, alignSelf: 'flex-start' }
      : align === 'right'
      ? { marginLeft: 'auto', marginRight: 0, alignSelf: 'flex-end' }
      : { marginLeft: 'auto', marginRight: 'auto' }; // center

  return (
    <NodeViewWrapper
      as="figure"
      className={`image-figure${selected ? ' ring-2 ring-blue-400 rounded' : ''}`}
      style={figureStyle}
    >
      <img
        src={src}
        alt={alt ?? ''}
        data-align={align}
        data-caption={caption ?? ''}
        draggable="false"
      />
      {caption && (
        <figcaption className="image-caption">
          {caption}
        </figcaption>
      )}
    </NodeViewWrapper>
  );
}
