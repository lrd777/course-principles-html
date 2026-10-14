#!/usr/bin/env python3
"""Assemble an explicitly located standalone course page. Python standard library only."""
import argparse
import html
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit


class Headings(HTMLParser):
    def __init__(self):
        super().__init__()
        self.items = []
        self.current = None
        self.elements = {}
        self.stack = []
        self.sequence = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.sequence += 1
        folded = any(item[2] for item in self.stack) or (tag == 'details' and 'open' not in attrs)
        hidden = any(item[3] for item in self.stack) or 'hidden' in attrs or bool(re.search(r'display\s*:\s*none', attrs.get('style', ''), re.I))
        ident = attrs.get('id')
        if ident:
            self.elements[ident] = {'tag': tag, 'order': self.sequence, 'end_order': self.sequence, 'folded': folded, 'hidden': hidden, 'text': ''}
        if tag not in {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}:
            self.stack.append((tag, ident, folded, hidden))
        if tag == 'h2':
            self.current = [attrs.get('id', ''), '']
        if tag in {'html', 'head', 'body'}:
            raise ValueError('Body input must be a fragment, without a document shell.')

    def handle_data(self, data):
        for _, ident, _, _ in self.stack:
            if ident:
                self.elements[ident]['text'] += data
        if self.current is not None:
            self.current[1] += data

    def handle_endtag(self, tag):
        if tag == 'h2' and self.current is not None:
            self.items.append(self.current)
            self.current = None
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                for _, ident, _, _ in self.stack[index:]:
                    if ident:
                        self.elements[ident]['end_order'] = self.sequence
                del self.stack[index:]
                break


def validate_teaching(units, parsed):
    """Check declared coverage structure, not the truth or depth of teaching prose."""
    if not isinstance(units, list) or not units:
        raise ValueError('Metadata requires a nonempty teaching_units coverage map.')
    roles = {'concept', 'algorithm', 'derivation', 'application', 'comparison'}
    unit_ids = set()
    for unit in units:
        if not isinstance(unit, dict) or not isinstance(unit.get('id'), str) or unit['id'] in unit_ids:
            raise ValueError('Teaching units need distinct ids.')
        unit_ids.add(unit['id'])
        if unit.get('role') not in roles or not isinstance(unit.get('source'), str) or not unit['source'].strip():
            raise ValueError('Each teaching unit needs a role and actual source location.')
    def element(ident, purpose):
        if not isinstance(ident, str) or ident not in parsed.elements:
            raise ValueError(f'Missing {purpose} anchor: {ident}')
        record = parsed.elements[ident]
        if record['folded'] or record['hidden']:
            raise ValueError(f'Core {purpose} must be visible by default: {ident}')
        if not record['text'].strip():
            raise ValueError(f'Empty {purpose} content: {ident}')
        return record
    completed_at = {}
    for unit in units:
        record = element(unit['id'], 'teaching unit')
        dependencies = unit.get('requires', [])
        if not isinstance(dependencies, list) or any(not isinstance(dep, str) for dep in dependencies):
            raise ValueError('Teaching dependencies must be unit-id arrays.')
        if unit['role'] == 'comparison' and not dependencies:
            raise ValueError('Comparison units must declare the previously taught methods.')
        for dep in dependencies:
            if dep not in unit_ids or element(dep, 'prerequisite')['order'] >= record['order']:
                raise ValueError(f'Prerequisite must be taught before {unit["id"]}: {dep}')
        if unit['role'] != 'algorithm':
            completed_at[unit['id']] = record['end_order']
            continue
        code = element(unit.get('pseudocode'), 'pseudocode')
        if code['order'] <= record['order']:
            raise ValueError('Introduce the algorithm before its pseudocode.')
        if code['tag'] not in {'pre', 'code', 'ol', 'table'}:
            raise ValueError('Pseudocode needs readable text steps, not just an image or demo.')
        symbols = unit.get('symbols')
        if not isinstance(symbols, list) or not symbols:
            raise ValueError('Algorithm units need symbol/data-object explanation anchors.')
        for ident in symbols:
            if element(ident, 'symbol explanation')['order'] >= code['order']:
                raise ValueError(f'Explain symbols before pseudocode: {ident}')
        explanation = element(unit.get('explanation'), 'step explanation')
        trace = element(unit.get('trace'), 'worked example')
        if code['order'] >= explanation['order'] or explanation['order'] >= trace['order']:
            raise ValueError('Algorithm order must be pseudocode, step explanation, then worked example.')
        completed_at[unit['id']] = max(record['end_order'], trace['end_order'])
    for unit in units:
        for dep in unit.get('requires', []):
            if completed_at[dep] >= parsed.elements[unit['id']]['order']:
                raise ValueError(f'Prerequisite must be completed before {unit["id"]}: {dep}')


def escape(value):
    return html.escape(str(value), quote=True)


def build(meta_path, body_path, output, overwrite=False):
    output = Path(output).expanduser()
    if not output.is_absolute() or output.suffix.lower() != '.html':
        raise ValueError('Supply an explicit absolute .html output path.')
    if output.exists() and not overwrite:
        raise FileExistsError('Output exists; use --overwrite only for an authorized update.')
    meta = json.loads(Path(meta_path).read_text(encoding='utf-8'))
    for field in ('title', 'scope'):
        if not isinstance(meta.get(field), str) or not meta[field].strip():
            raise ValueError(f'Missing nonempty metadata: {field}')
    sources = meta.get('sources')
    if not isinstance(sources, list) or not sources:
        raise ValueError('At least one actual course source is required.')
    body = Path(body_path).read_text(encoding='utf-8')
    headings = Headings()
    headings.feed(body)
    validate_teaching(meta.get('teaching_units'), headings)
    if not headings.items or any(not ident or not title.strip() for ident, title in headings.items):
        raise ValueError('Each main section requires a nonempty h2 with an id.')
    source_ids = []
    entries = []
    for source in sources:
        ident = source.get('id', '')
        if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]*', ident):
            raise ValueError('Each source requires a simple unique id.')
        if not source.get('label') or not source.get('location'):
            raise ValueError('Sources need actual labels and locations.')
        kind = source.get('kind', 'course')
        if kind not in {'course', 'supplement'}:
            raise ValueError('Source kind must be course or supplement.')
        label = escape(source['label'])
        url = source.get('href', '')
        if url:
            parsed = urlsplit(url)
            if parsed.scheme not in {'https', 'http'} or not parsed.netloc:
                raise ValueError('Source URLs must be absolute HTTP(S) URLs.')
            label = f'<a href="{escape(url)}" target="_blank" rel="noopener noreferrer">{label}</a>'
        source_ids.append(ident)
        tag = '课程材料' if kind == 'course' else '补充来源'
        entries.append(f'<li id="{escape(ident)}" data-kind="source"><span class="source-kind">{tag}</span> · {label} · {escape(source["location"])}</li>')
    all_ids = list(headings.elements) + source_ids + ['course-main', 'course-sources', 'lesson-content', 'math-status', 'theme-toggle', 'annotation-open']
    if len(all_ids) != len(set(all_ids)):
        raise ValueError('Section, source and template ids must be distinct.')
    if not any(source.get('kind', 'course') == 'course' for source in sources):
        raise ValueError('Include at least one supplied course source.')
    toc = ''.join(f'<a href="#{escape(ident)}">{escape(title.strip())}</a>' for ident, title in headings.items)
    toc += '<a href="#course-sources">材料与补充来源</a>'
    learner_note = meta.get('learner_note', '')
    if not isinstance(learner_note, str):
        raise ValueError('learner_note must be text when provided.')
    learner_html = '<div class="learner-note"><strong>学习侧重点</strong>' + escape(learner_note) + '</div>' if meta.get('show_learner_note') is True and learner_note.strip() else ''
    lesson_id = meta.get('lesson_id')
    if lesson_id is None:
        identity = json.dumps({'title': meta['title'], 'materials': [source['label'] for source in sources if source.get('kind', 'course') == 'course']}, ensure_ascii=False, sort_keys=True)
        lesson_id = 'course-' + hashlib.sha256(identity.encode('utf-8')).hexdigest()[:20]
    if not isinstance(lesson_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', lesson_id):
        raise ValueError('lesson_id must be a stable 1–80 character ASCII identifier.')
    assets = Path(__file__).resolve().parent.parent / 'assets'
    annotation_css = (assets / 'annotations.css').read_text(encoding='utf-8')
    annotation_ui = (assets / 'annotations-ui.html').read_text(encoding='utf-8')
    annotation_js = (assets / 'annotations.js').read_text(encoding='utf-8')
    if '</style' in annotation_css.lower() or '</script' in annotation_js.lower():
        raise ValueError('Unexpected closing token in annotation assets.')
    substitutions = {'TITLE': escape(meta['title']), 'SCOPE': escape(meta['scope']), 'LEARNER_NOTE': learner_html, 'LESSON_ID': lesson_id, 'BODY': body, 'TOC': toc, 'SOURCES': ''.join(entries), 'ANNOTATION_CSS': annotation_css, 'ANNOTATION_UI': annotation_ui, 'ANNOTATION_JS': annotation_js}
    template = (assets / 'lesson-template.html').read_text(encoding='utf-8')
    result = re.sub(r'@@([A-Z_]+)@@', lambda match: substitutions[match[1]], template)
    if re.search(r'@@[A-Z_]+@@', result):
        raise ValueError('Unresolved template marker found.')
    # Check before creating directories or replacing any existing output.
    from check_lesson import inspect_html
    errors = inspect_html(result)
    if errors:
        raise ValueError('\n'.join(errors))
    output.parent.mkdir(parents=True, exist_ok=True)
    if overwrite:
        import os
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=output.parent, delete=False) as temp:
            temp.write(result)
            temporary = Path(temp.name)
        try:
            os.replace(temporary, output)
        finally:
            temporary.unlink(missing_ok=True)
    else:
        with output.open('x', encoding='utf-8') as target:
            target.write(result)
    return {'path': str(output), 'sections': len(headings.items), 'sources': len(sources), 'bytes': len(result.encode('utf-8'))}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--meta', required=True)
    parser.add_argument('--body', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--overwrite', action='store_true')
    args = parser.parse_args()
    try:
        print(json.dumps(build(args.meta, args.body, args.output, args.overwrite), ensure_ascii=False))
    except (ValueError, OSError, KeyError, TypeError) as error:
        parser.exit(1, f'Build failed: {error}\n')
