/* ============================================================================
   Notes Rich-Text Editor & Content Transformation Engine
   Provides sanitized rich-text utilities, checklist management, table creation,
   markdown conversion, word counts, and safe HTML rendering.
   ============================================================================ */
window.App = window.App || {};

App.notesEditor = (function () {
  'use strict';

  const ALLOWED_TAGS = new Set([
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's',
    'strike', 'del', 'ul', 'ol', 'li', 'input', 'table', 'thead', 'tbody',
    'tr', 'th', 'td', 'blockquote', 'pre', 'code', 'hr', 'a', 'br'
  ]);

  /**
   * Sanitizes rich HTML to prevent XSS attacks while preserving formatting.
   */
  function sanitizeHtml(rawHtml) {
    if (!rawHtml || typeof rawHtml !== 'string') return '';
    const temp = document.createElement('div');
    temp.innerHTML = rawHtml;

    function cleanNode(node) {
      const children = Array.from(node.childNodes);
      for (const child of children) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const tag = child.tagName.toLowerCase();
          if (!ALLOWED_TAGS.has(tag)) {
            // Replace disallowed tag with its text content
            const textNode = document.createTextNode(child.textContent || '');
            node.replaceChild(textNode, child);
          } else {
            // Strip hazardous attributes, keeping only safe ones
            const attrs = Array.from(child.attributes);
            for (const attr of attrs) {
              const name = attr.name.toLowerCase();
              const val = attr.value.trim();
              if (name.startsWith('on') || val.startsWith('javascript:') || val.startsWith('data:text/html')) {
                child.removeAttribute(attr.name);
              } else if (name === 'href') {
                if (!val.startsWith('http://') && !val.startsWith('https://') && !val.startsWith('mailto:') && !val.startsWith('#')) {
                  child.removeAttribute(attr.name);
                } else {
                  child.setAttribute('target', '_blank');
                  child.setAttribute('rel', 'noopener noreferrer');
                }
              } else if (name === 'type' && tag === 'input') {
                if (val !== 'checkbox') child.removeAttribute(attr.name);
              } else if (name === 'checked' && tag === 'input') {
                // Keep checked state
              } else if (name === 'class' || name === 'data-task') {
                // Keep safe styling and checklist classes
              } else {
                child.removeAttribute(attr.name);
              }
            }
            cleanNode(child);
          }
        }
      }
    }

    cleanNode(temp);
    return temp.innerHTML;
  }

  /**
   * Converts HTML to clean plain text for search and snippets.
   */
  function htmlToPlainText(html) {
    if (!html) return '';
    if (typeof html !== 'string') return String(html);
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return (temp.textContent || temp.innerText || '').trim();
  }

  /**
   * Computes word and character count.
   */
  function countWords(text) {
    const clean = (text || '').trim();
    if (!clean) return { words: 0, characters: 0 };
    const words = clean.split(/\s+/).filter(Boolean).length;
    return { words, characters: clean.length };
  }

  /**
   * Calculates reading time in minutes.
   */
  function readingTimeMinutes(wordCount) {
    return Math.max(1, Math.ceil(wordCount / 200));
  }

  /**
   * Calculates full statistics from either HTML or plain text.
   */
  function calculateStats(htmlOrText) {
    if (!htmlOrText) return { words: 0, characters: 0, readingTimeMinutes: 1 };
    const plain = htmlToPlainText(htmlOrText);
    const wc = countWords(plain);
    return {
      words: wc.words,
      characters: wc.characters,
      readingTimeMinutes: readingTimeMinutes(wc.words),
    };
  }

  /**
   * Executes rich text formatting command on active selection.
   */
  function executeCommand(command, value = null) {
    try {
      document.execCommand(command, false, value);
    } catch (e) {
      console.warn('executeCommand notice:', e);
    }
  }

  /**
   * Formats block (h1, h2, h3, blockquote, p).
   */
  function formatBlock(tag) {
    executeCommand('formatBlock', tag);
  }

  /**
   * Inserts an anchor link into the active selection.
   */
  function insertLink(url) {
    if (!url) return;
    executeCommand('createLink', url);
  }

  /**
   * Inserts an interactive checklist item into the editor.
   */
  function insertChecklist(editorEl) {
    const el = editorEl || document.querySelector('#notesContentEditable');
    if (el) el.focus();
    const checklistHtml = '<div class="notes-task-item"><input type="checkbox" class="notes-task-checkbox"><div class="notes-task-text">Task item...</div></div><p><br></p>';
    executeCommand('insertHTML', checklistHtml);
  }

  /**
   * Inserts a clean structured table into the editor.
   */
  function insertTable(rows = 3, cols = 3, editorEl) {
    // Handle parameter flipping if caller passed editorEl as first argument
    let r = rows;
    let c = cols;
    let el = editorEl;
    if (typeof rows === 'object' && rows !== null) {
      el = rows;
      r = typeof cols === 'number' ? cols : 3;
      c = typeof editorEl === 'number' ? editorEl : 3;
    }
    el = el || document.querySelector('#notesContentEditable');
    if (el) el.focus();

    let tableHtml = '<div class="notes-table-wrap"><table class="notes-rich-table"><thead><tr>';
    for (let j = 0; j < c; j++) {
      tableHtml += `<th>Header ${j + 1}</th>`;
    }
    tableHtml += '</tr></thead><tbody>';
    for (let i = 0; i < r; i++) {
      tableHtml += '<tr>';
      for (let j = 0; j < c; j++) {
        tableHtml += '<td>Cell</td>';
      }
      tableHtml += '</tr>';
    }
    tableHtml += '</tbody></table></div><p><br></p>';
    executeCommand('insertHTML', tableHtml);
  }

  /**
   * Inserts a code block into the editor.
   */
  function insertCodeBlock(editorEl) {
    const el = editorEl || document.querySelector('#notesContentEditable');
    if (el) el.focus();
    const codeHtml = '<pre><code>// Note / Code block...</code></pre><p><br></p>';
    executeCommand('insertHTML', codeHtml);
  }

  /**
   * Converts HTML content to Markdown for export.
   */
  function htmlToMarkdown(html) {
    if (!html) return '';
    let md = html;
    // Task items
    md = md.replace(/<div class="notes-task-item">\s*<input type="checkbox" checked[^>]*>\s*<div[^>]*>(.*?)<\/div>\s*<\/div>/gi, '- [x] $1\n');
    md = md.replace(/<div class="notes-task-item">\s*<input type="checkbox"[^>]*>\s*<div[^>]*>(.*?)<\/div>\s*<\/div>/gi, '- [ ] $1\n');
    md = md.replace(/<div class="notes-task-item">\s*<input type="checkbox" checked[^>]*>\s*<span>(.*?)<\/span>\s*<\/div>/gi, '- [x] $1\n');
    md = md.replace(/<div class="notes-task-item">\s*<input type="checkbox"[^>]*>\s*<span>(.*?)<\/span>\s*<\/div>/gi, '- [ ] $1\n');
    // Headings
    md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
    md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
    md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
    // Bold, Italic, Strikethrough
    md = md.replace(/<(strong|b)[^>]*>(.*?)<\/(strong|b)>/gi, '**$2**');
    md = md.replace(/<(em|i)[^>]*>(.*?)<\/(em|i)>/gi, '*$2*');
    md = md.replace(/<(del|s|strike)[^>]*>(.*?)<\/(del|s|strike)>/gi, '~~$2~~');
    // Lists
    md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
    md = md.replace(/<\/ul>/gi, '\n');
    md = md.replace(/<\/ol>/gi, '\n');
    // Code blocks & inline code
    md = md.replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gis, '```\n$1\n```\n\n');
    md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
    // Blockquote
    md = md.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, '> $1\n\n');
    // Links
    md = md.replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
    // Horizontal Rule
    md = md.replace(/<hr[^>]*>/gi, '\n---\n\n');
    // Paragraphs & Breaks
    md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
    md = md.replace(/<br\s*[\/]?>/gi, '\n');
    // Strip any remaining HTML tags
    md = md.replace(/<[^>]+>/g, '');
    // Decode HTML entities
    const decoder = document.createElement('textarea');
    decoder.innerHTML = md;
    return decoder.value.trim();
  }

  /**
   * Converts Markdown text to formatted HTML for import.
   */
  function markdownToHtml(md) {
    if (!md) return '';
    let html = App.utils.escapeHtml(md);

    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Headings
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    // Tasks
    html = html.replace(/^- \[x\] (.*$)/gim, '<div class="notes-task-item checked"><input type="checkbox" checked class="notes-task-checkbox"> <div class="notes-task-text">$1</div></div>');
    html = html.replace(/^- \[ \] (.*$)/gim, '<div class="notes-task-item"><input type="checkbox" class="notes-task-checkbox"> <div class="notes-task-text">$1</div></div>');
    // Bullet lists
    html = html.replace(/^\* (.*$)/gim, '<li>$1</li>');
    html = html.replace(/^- (.*$)/gim, '<li>$1</li>');
    // Bold, Italic, Strikethrough
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // Horizontal rules
    html = html.replace(/^---$/gim, '<hr>');
    // Paragraphs
    html = html.replace(/\n\n+/g, '</p><p>');
    return `<p>${html}</p>`;
  }

  return {
    sanitizeHtml,
    htmlToPlainText,
    extractPlainText: htmlToPlainText,
    countWords,
    readingTimeMinutes,
    calculateStats,
    executeCommand,
    execCommand: executeCommand,
    formatBlock,
    insertLink,
    insertChecklist,
    insertTable,
    insertCodeBlock,
    htmlToMarkdown,
    markdownToHtml,
  };
})();
