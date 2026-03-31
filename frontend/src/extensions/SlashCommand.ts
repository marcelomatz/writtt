import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import { SlashCommandList, getSlashItems } from '../components/SlashCommandMenu';

export const SlashCommandKey = new PluginKey('slashCommand');

export function createSlashCommand(lang: 'pt' | 'en' = 'pt') {
  const items = getSlashItems(lang);

  return Extension.create({
    name: 'slashCommand',

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          char: '/',
          pluginKey: SlashCommandKey,
          items: ({ query }: { query: string }) => {
            if (!query) return items;
            return items.filter(
              (item) =>
                item.title.toLowerCase().includes(query.toLowerCase()) ||
                item.description.toLowerCase().includes(query.toLowerCase()),
            );
          },
          command: ({ editor, range, props }: any) => {
            props.command({ editor, range });
          },
          render: () => {
            let component: ReactRenderer | null = null;
            let popup: HTMLDivElement | null = null;

            return {
              onStart: (props: any) => {
                component = new ReactRenderer(SlashCommandList, {
                  props,
                  editor: props.editor,
                });

                popup = document.createElement('div');
                popup.style.position = 'absolute';
                popup.style.zIndex = '999';
                popup.appendChild(component.element);
                document.body.appendChild(popup);

                updatePosition(props, popup);
              },

              onUpdate(props: any) {
                component?.updateProps(props);
                if (popup) updatePosition(props, popup);
              },

              onKeyDown(props: any) {
                if (props.event.key === 'Escape') {
                  popup?.remove();
                  popup = null;
                  return true;
                }
                return (component?.ref as any)?.onKeyDown?.(props) ?? false;
              },

              onExit() {
                popup?.remove();
                popup = null;
                component?.destroy();
              },
            };
          },
        }),
      ];
    },
  });
}

function updatePosition(props: any, popup: HTMLDivElement) {
  const rect = props.clientRect?.();
  if (!rect) return;
  popup.style.left = `${rect.left + window.scrollX}px`;
  popup.style.top = `${rect.bottom + window.scrollY + 6}px`;
}
