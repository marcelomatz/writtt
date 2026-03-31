import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { useDictionaryStore } from '../store/dictionaryStore';

const customDictKey = new PluginKey('customDictionary');

// Metadata key to signal a forced rebuild from outside
const FORCE_REBUILD = 'customDictForceRebuild';

/**
 * ProseMirror plugin that wraps words found in the user's custom dictionary
 * with <span spellcheck="false"> to suppress browser spellcheck underlines.
 * Subscribes to the dictionary store so decorations update immediately.
 */
export const CustomDictionary = Extension.create({
  name: 'customDictionary',

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: customDictKey,
        state: {
          init(_, state) {
            return buildDecorations(state.doc);
          },
          apply(tr, oldSet) {
            // Rebuild on doc change OR when forced by store subscription
            if (tr.docChanged || tr.getMeta(FORCE_REBUILD)) {
              return buildDecorations(tr.doc);
            }
            return oldSet;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
        view() {
          // Subscribe to dictionary store changes
          const unsubscribe = useDictionaryStore.subscribe(() => {
            // Dispatch an empty transaction with metadata to force decoration rebuild
            const tr = editor.state.tr.setMeta(FORCE_REBUILD, true);
            editor.view.dispatch(tr);
          });

          return {
            destroy() {
              unsubscribe();
            },
          };
        },
      }),
    ];
  },
});

function buildDecorations(doc: any): DecorationSet {
  const words = useDictionaryStore.getState().words;
  if (words.length === 0) return DecorationSet.empty;

  const decorations: Decoration[] = [];
  const wordSet = new Set(words);

  doc.descendants((node: any, pos: number) => {
    if (!node.isText) return;
    const text = node.text ?? '';
    const regex = /\b[\p{L}\p{M}'-]+\b/gu;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const word = match[0].toLowerCase();
      if (wordSet.has(word)) {
        const from = pos + match.index;
        const to = from + match[0].length;
        decorations.push(
          Decoration.inline(from, to, {
            spellcheck: 'false',
            'data-dict': 'true',
          }),
        );
      }
    }
  });

  return DecorationSet.create(doc, decorations);
}
