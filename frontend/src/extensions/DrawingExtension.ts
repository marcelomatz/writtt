import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { DrawingNodeView } from '../components/DrawingNodeView';

export interface DrawingOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    drawing: {
      insertDrawing: () => ReturnType;
    };
  }
}

export const Drawing = Node.create<DrawingOptions>({
  name: 'drawing',
  group: 'block',
  atom: true,
  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      'data-strokes': {
        default: '[]',
      },
      'data-image': {
        default: '',
      },
      width: {
        default: '100%',
      },
      height: {
        default: '300',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="drawing"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'drawing',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DrawingNodeView);
  },

  addCommands() {
    return {
      insertDrawing:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              'data-strokes': '[]',
              'data-image': '',
              width: '100%',
              height: '300',
            },
          });
        },
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const img = node.attrs['data-image'];
          if (img) {
            state.write(`![Drawing](${img})`);
          } else {
            state.write('<!-- drawing -->');
          }
        },
        parse: {},
      },
    };
  },
});
