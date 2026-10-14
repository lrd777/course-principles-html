#!/usr/bin/env python3
"""Structural checks only; professional accuracy and browser behavior need review."""
import argparse
import re
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.links = []
        self.errors = []
        self.h1 = 0
        self.sources = 0
        self.quiz_stack = []
        self.div_depth = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = attrs.get('class', '').split()
        if attrs.get('id'):
            self.ids.append(attrs['id'])
        if tag == 'a' and attrs.get('href', '').startswith('#'):
            self.links.append(attrs['href'][1:])
        if tag == 'h1':
            self.h1 += 1
        if tag == 'li' and attrs.get('data-kind') == 'source':
            self.sources += 1
        if tag == 'div':
            self.div_depth += 1
            if 'quiz' in classes:
                self.quiz_stack.append({'depth': self.div_depth, 'options': [], 'feedback': False})
        if self.quiz_stack:
            quiz = self.quiz_stack[-1]
            if tag == 'button' and 'data-correct' in attrs:
                value = attrs['data-correct']
                quiz['options'].append(value)
                if value not in {'true', 'false'} or not attrs.get('data-feedback') or attrs.get('type') != 'button':
                    self.errors.append('Quiz buttons need type=button, true/false correctness and explanatory feedback.')
            if 'quiz-feedback' in classes and attrs.get('aria-live') == 'polite':
                quiz['feedback'] = True
        resource = attrs.get('src') if tag in {'script', 'img', 'iframe', 'audio', 'video', 'source'} else attrs.get('href') if tag == 'link' else None
        if resource:
            if resource.startswith('data:') and tag in {'img', 'audio', 'video', 'source'}:
                return
            parsed = urlsplit(resource)
            if tag in {'link', 'script'} and parsed.scheme == 'https' and parsed.netloc == 'cdn.jsdelivr.net' and re.fullmatch(r'/npm/katex@[0-9.]+/dist/katex\.min\.(css|js)', parsed.path):
                return
            self.errors.append(f'Nonembedded resource outside approved formula files: {resource}')

    def handle_endtag(self, tag):
        if tag == 'div':
            if self.quiz_stack and self.quiz_stack[-1]['depth'] == self.div_depth:
                quiz = self.quiz_stack.pop()
                if len(quiz['options']) < 2 or 'true' not in quiz['options'] or not quiz['feedback']:
                    self.errors.append('Each interactive quiz needs two options, a correct answer and live feedback.')
            self.div_depth -= 1


def inspect_html(source):
    page = Page()
    page.feed(source)
    errors = page.errors
    if not re.search(r'<!doctype\s+html\s*>', source, re.I):
        errors.append('Missing HTML5 document shell.')
    if page.h1 != 1 or not page.sources:
        errors.append('Expected one page title and nonempty actual sources.')
    for ident, count in Counter(page.ids).items():
        if count > 1:
            errors.append(f'Duplicate id: {ident}')
    for target in page.links:
        if target and target not in page.ids:
            errors.append(f'Broken internal anchor: #{target}')
    if re.search(r'@@[A-Z_]+@@', source):
        errors.append('Unresolved template markers.')
    if page.quiz_stack:
        errors.append('Unclosed quiz component.')
    return errors


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('html', type=Path)
    args = parser.parse_args()
    try:
        errors = inspect_html(args.html.read_text(encoding='utf-8'))
    except OSError as error:
        parser.exit(1, f'{error}\n')
    if errors:
        parser.exit(1, '\n'.join(errors) + '\n')
    print('Structural checks passed. Content and browser rendering still require verification.')
