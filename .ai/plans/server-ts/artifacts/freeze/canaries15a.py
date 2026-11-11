# Task 15a canaries: edit ONE value in each fixture file, run the suite that reads it,
# show the expected test fails, restore the file and check its md5. Run from server/.
import hashlib, re, subprocess

CANARIES = [
    ('seed.jsonl', '"name":"Casey Creator"', '"name":"Casey Kreator"', 'test/services/lifecycleParity.test.js'),
    ('lifecycle.jsonl', '"message":"This match has already started"', '"message":"This match has already begun"', 'test/services/lifecycleParity.test.js'),
    ('emissions.jsonl', '"break_remaining":54', '"break_remaining":45', 'test/workers/emissionDifferential.test.js'),
    ('repositories.jsonl', '"key":"matchGraph match:done","mat":"mats:1"', '"key":"matchGraph match:done","mat":"mats:2"', 'test/db/repositories/differential.test.js'),
    ('webSocketTier.jsonl', '"connectError":"Invalid value {}","connected":false,"key":"script object token: connect_error"', '"connectError":"Invalid value []","connected":false,"key":"script object token: connect_error"', 'test/ws/webSocketTier.test.js'),
    ('permissions.jsonl', '{"key":"creator/none","rows":["GGGGGGGGG"', '{"key":"creator/none","rows":["dGGGGGGGG"', 'test/http/permissions.test.ts'),
    ('errorRendering.jsonl', '"key":"generic Error","status":500', '"key":"generic Error","status":501', 'test/http/envelope.test.ts'),
]

for name, old, new, test in CANARIES:
    path = 'test/fixtures/frozen/' + name
    orig = open(path, 'rb').read()
    before = hashlib.md5(orig).hexdigest()
    text = orig.decode()
    assert text.count(old) >= 1, (name, old)
    open(path, 'w').write(text.replace(old, new, 1))
    try:
        r = subprocess.run(['timeout', '200', 'bun', 'test', '--isolate', test], stdin=subprocess.DEVNULL, capture_output=True, text=True)
        out = r.stdout + r.stderr
        p = re.search(r'^\s*(\d+) pass', out, re.M); f = re.search(r'^\s*(\d+) fail', out, re.M)
        fails = re.findall(r'^\(fail\) (.*?)(?: \[[\d.]+ms\])?$', out, re.M)
        print(f"| {name} | {old[:50]} -> {new[:50]} | {'FAILS' if f and int(f.group(1)) > 0 else 'PASSES (BAD)'} | {f.group(1) if f else '?'} fail / {p.group(1) if p else '?'} pass: {'; '.join(x[:90] for x in fails)} |", flush=True)
    finally:
        open(path, 'wb').write(orig)
    assert hashlib.md5(open(path, 'rb').read()).hexdigest() == before, name + ' NOT RESTORED'
print(subprocess.run(['git', 'status', '--short', 'test/fixtures'], capture_output=True, text=True).stdout or 'restored')
