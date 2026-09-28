import {
  BlockquoteFeature, BoldFeature, FixedToolbarFeature, HeadingFeature, InlineToolbarFeature, ItalicFeature,
  LinkFeature, OrderedListFeature, ParagraphFeature, UnderlineFeature, UnorderedListFeature, lexicalEditor,
} from '@payloadcms/richtext-lexical';

/** Deliberately small feature set: no uploads, embeds, HTML, code or custom blocks.
 * Public rendering re-validates every node (src/lib/rich-text.ts). */
export const articleEditor = lexicalEditor({
  features: () => [
    ParagraphFeature(), HeadingFeature({ enabledHeadingSizes: ['h3', 'h4'] }), BoldFeature(), ItalicFeature(), UnderlineFeature(),
    UnorderedListFeature(), OrderedListFeature(), BlockquoteFeature(),
    LinkFeature({ enabledCollections: ['articles'], maxDepth: 1 }),
    FixedToolbarFeature(), InlineToolbarFeature(),
  ],
});
