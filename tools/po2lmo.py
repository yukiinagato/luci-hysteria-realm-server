#!/usr/bin/env python3
# Minimal, dependency-free LuCI .po -> .lmo converter.
# Faithfully reimplements LuCI's po2lmo.c + sfh_hash (Apache-2.0, Jo-Philipp
# Wich / SuperFastHash by Paul Hsieh). Output is byte-compatible with the
# .lmo files produced by the official LuCI build system.
#
# Usage: po2lmo.py input.po output.lmo

import sys

MASK = 0xFFFFFFFF


def sfh_hash(data: bytes, init: int) -> int:
    if not data:
        return 0
    h = init & MASK
    length = len(data)
    rem = length & 3
    n = length >> 2
    i = 0

    def g16(o):
        return data[o] | (data[o + 1] << 8)

    while n > 0:
        h = (h + g16(i)) & MASK
        tmp = ((g16(i + 2) << 11) & MASK) ^ h
        h = ((h << 16) & MASK) ^ tmp
        i += 4
        h = (h + (h >> 11)) & MASK
        n -= 1

    if rem == 3:
        h = (h + g16(i)) & MASK
        h ^= (h << 16) & MASK
        sc = data[i + 2]
        if sc >= 128:
            sc -= 256
        h ^= (sc << 18) & MASK
        h = (h + (h >> 11)) & MASK
    elif rem == 2:
        h = (h + g16(i)) & MASK
        h ^= (h << 11) & MASK
        h = (h + (h >> 17)) & MASK
    elif rem == 1:
        sc = data[i]
        if sc >= 128:
            sc -= 256
        h = (h + sc) & MASK
        h ^= (h << 10) & MASK
        h = (h + (h >> 1)) & MASK

    h &= MASK
    h ^= (h << 3) & MASK
    h = (h + (h >> 5)) & MASK
    h ^= (h << 4) & MASK
    h = (h + (h >> 17)) & MASK
    h ^= (h << 25) & MASK
    h = (h + (h >> 6)) & MASK
    return h & MASK


def decode_segment(seg: str) -> str:
    # Replicates po2lmo extract_string: only \" -> " and \\ -> \ are unescaped;
    # any other backslash sequence keeps the backslash literally.
    out = []
    esc = False
    for ch in seg:
        if esc:
            if ch in ('"', '\\'):
                out.append(ch)
            else:
                out.append('\\')
                out.append(ch)
            esc = False
        elif ch == '\\':
            esc = True
        else:
            out.append(ch)
    if esc:
        out.append('\\')
    return ''.join(out)


def parse_po(path):
    entries = []
    cur = None  # 'id' or 'str'
    msgid = []
    msgstr = []

    def flush():
        if msgid is not None:
            mid = ''.join(msgid)
            mstr = ''.join(msgstr)
            entries.append((mid, mstr))

    import re
    qre = re.compile(r'"(.*)"\s*$')

    with open(path, encoding='utf-8') as fh:
        for raw in fh:
            line = raw.rstrip('\n')
            s = line.strip()
            if s.startswith('#') or s == '':
                continue
            if s.startswith('msgid '):
                if msgid or msgstr:
                    flush()
                msgid.clear()
                msgstr.clear()
                cur = 'id'
                m = qre.search(s[len('msgid '):])
                if m:
                    msgid.append(decode_segment(m.group(1)))
            elif s.startswith('msgstr '):
                cur = 'str'
                m = qre.search(s[len('msgstr '):])
                if m:
                    msgstr.append(decode_segment(m.group(1)))
            elif s.startswith('"'):
                m = qre.search(s)
                if m:
                    (msgid if cur == 'id' else msgstr).append(decode_segment(m.group(1)))
        flush()
    return entries


def main():
    if len(sys.argv) != 3:
        sys.stderr.write("Usage: po2lmo.py input.po output.lmo\n")
        sys.exit(1)

    entries = parse_po(sys.argv[1])

    data = bytearray()
    index = []  # (key_id, val_id, offset, length)
    offset = 0

    for mid, mstr in entries:
        if not mid or not mstr:
            continue  # header / untranslated -> skipped, exactly like po2lmo
        kb = mid.encode('utf-8')
        vb = mstr.encode('utf-8')
        key_id = sfh_hash(kb, len(kb))
        val_hash = sfh_hash(vb, len(vb))
        if key_id == val_hash:
            continue
        length = len(vb)
        index.append((key_id, 1, offset, length))  # val_id = plural_num+1 = 1
        data += vb
        pad = (4 - (length % 4)) % 4
        data += b'\x00' * pad
        offset += length + pad

    index.sort(key=lambda e: e[0])

    out = bytearray()
    out += data
    for key_id, val_id, off, length in index:
        out += key_id.to_bytes(4, 'big')
        out += val_id.to_bytes(4, 'big')
        out += off.to_bytes(4, 'big')
        out += length.to_bytes(4, 'big')

    if offset > 0:
        out += offset.to_bytes(4, 'big')
        with open(sys.argv[2], 'wb') as fh:
            fh.write(out)
    else:
        sys.stderr.write("No translatable entries; .lmo not written\n")
        sys.exit(1)


if __name__ == '__main__':
    main()
