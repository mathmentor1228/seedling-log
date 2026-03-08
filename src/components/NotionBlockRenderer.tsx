import React from 'react';

interface RichText {
  plain_text: string;
  href?: string | null;
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
    color?: string;
  };
}

function renderRichText(texts: RichText[]) {
  if (!texts || texts.length === 0) return null;
  return texts.map((t, i) => {
    let el: React.ReactNode = t.plain_text;
    const a = t.annotations;
    if (a?.code) el = <code key={i} className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">{el}</code>;
    if (a?.bold) el = <strong key={i}>{el}</strong>;
    if (a?.italic) el = <em key={i}>{el}</em>;
    if (a?.strikethrough) el = <s key={i}>{el}</s>;
    if (a?.underline) el = <u key={i}>{el}</u>;
    if (t.href) el = <a key={i} href={t.href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">{el}</a>;
    if (!t.href && !a?.code && !a?.bold && !a?.italic && !a?.strikethrough && !a?.underline) {
      return <span key={i}>{el}</span>;
    }
    return <React.Fragment key={i}>{el}</React.Fragment>;
  });
}

function NotionBlock({ block }: { block: any }) {
  const { type } = block;
  const data = block[type];

  switch (type) {
    case 'paragraph':
      return <p className="my-1.5 leading-relaxed text-foreground">{renderRichText(data?.rich_text)}</p>;
    
    case 'heading_1':
      return <h1 className="text-2xl font-bold mt-6 mb-3 text-foreground">{renderRichText(data?.rich_text)}</h1>;
    
    case 'heading_2':
      return <h2 className="text-xl font-semibold mt-5 mb-2 text-foreground">{renderRichText(data?.rich_text)}</h2>;
    
    case 'heading_3':
      return <h3 className="text-lg font-semibold mt-4 mb-2 text-foreground">{renderRichText(data?.rich_text)}</h3>;
    
    case 'bulleted_list_item':
      return <li className="ml-5 list-disc my-0.5 text-foreground">{renderRichText(data?.rich_text)}</li>;
    
    case 'numbered_list_item':
      return <li className="ml-5 list-decimal my-0.5 text-foreground">{renderRichText(data?.rich_text)}</li>;
    
    case 'to_do':
      return (
        <div className="flex items-start gap-2 my-1">
          <input type="checkbox" checked={data?.checked} readOnly className="mt-1" />
          <span className={data?.checked ? 'line-through text-muted-foreground' : 'text-foreground'}>
            {renderRichText(data?.rich_text)}
          </span>
        </div>
      );
    
    case 'toggle':
      return (
        <details className="my-2">
          <summary className="cursor-pointer font-medium text-foreground">{renderRichText(data?.rich_text)}</summary>
        </details>
      );
    
    case 'code':
      return (
        <pre className="bg-muted rounded-lg p-4 my-3 overflow-x-auto">
          <code className="text-sm font-mono text-foreground">{data?.rich_text?.map((t: RichText) => t.plain_text).join('')}</code>
        </pre>
      );
    
    case 'quote':
      return (
        <blockquote className="border-l-4 border-primary pl-4 my-3 italic text-muted-foreground">
          {renderRichText(data?.rich_text)}
        </blockquote>
      );
    
    case 'callout':
      return (
        <div className="flex gap-3 bg-muted/50 rounded-lg p-4 my-3 border border-border">
          {data?.icon?.emoji && <span className="text-xl">{data.icon.emoji}</span>}
          <div className="text-foreground">{renderRichText(data?.rich_text)}</div>
        </div>
      );
    
    case 'divider':
      return <hr className="my-4 border-border" />;
    
    case 'image': {
      const url = data?.file?.url || data?.external?.url;
      const caption = data?.caption;
      return url ? (
        <figure className="my-4">
          <img src={url} alt={caption?.[0]?.plain_text || ''} className="rounded-lg max-w-full" />
          {caption?.length > 0 && (
            <figcaption className="text-sm text-muted-foreground mt-1 text-center">
              {renderRichText(caption)}
            </figcaption>
          )}
        </figure>
      ) : null;
    }
    
    case 'bookmark':
    case 'link_preview':
      return data?.url ? (
        <a href={data.url} target="_blank" rel="noopener noreferrer" 
           className="block my-2 p-3 rounded-lg border border-border hover:bg-muted/50 text-primary underline break-all">
          🔗 {data.url}
        </a>
      ) : null;
    
    case 'table':
      return null; // Table rows handled separately
    
    case 'table_row':
      return (
        <tr>
          {data?.cells?.map((cell: RichText[], ci: number) => (
            <td key={ci} className="border border-border px-3 py-2 text-foreground">{renderRichText(cell)}</td>
          ))}
        </tr>
      );

    case 'child_page':
      return (
        <div className="my-2 p-3 rounded-lg border border-border bg-muted/30">
          📄 <span className="font-medium text-foreground">{data?.title}</span>
        </div>
      );

    case 'child_database':
      return (
        <div className="my-2 p-3 rounded-lg border border-border bg-muted/30">
          🗄️ <span className="font-medium text-foreground">{data?.title}</span>
        </div>
      );

    default:
      return null;
  }
}

export function NotionBlockRenderer({ blocks }: { blocks: any[] }) {
  // Group list items
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];

    if (block.type === 'bulleted_list_item') {
      const items: any[] = [];
      while (i < blocks.length && blocks[i].type === 'bulleted_list_item') {
        items.push(blocks[i]);
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="my-2">
          {items.map((b) => <NotionBlock key={b.id} block={b} />)}
        </ul>
      );
      continue;
    }

    if (block.type === 'numbered_list_item') {
      const items: any[] = [];
      while (i < blocks.length && blocks[i].type === 'numbered_list_item') {
        items.push(blocks[i]);
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="my-2">
          {items.map((b) => <NotionBlock key={b.id} block={b} />)}
        </ol>
      );
      continue;
    }

    if (block.type === 'table') {
      // Collect table rows that follow
      const tableBlock = block;
      i++;
      const rows: any[] = [];
      while (i < blocks.length && blocks[i].type === 'table_row') {
        rows.push(blocks[i]);
        i++;
      }
      elements.push(
        <div key={tableBlock.id} className="my-4 overflow-x-auto">
          <table className="w-full border-collapse border border-border">
            <tbody>
              {rows.map((r) => <NotionBlock key={r.id} block={r} />)}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    elements.push(<NotionBlock key={block.id} block={block} />);
    i++;
  }

  return <div className="notion-content">{elements}</div>;
}
