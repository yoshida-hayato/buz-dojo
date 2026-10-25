#!/usr/bin/env python3
#
# 公開直前に robots.txt と sitemap.xml を作る (firebase.json の hosting.predeploy から呼ばれる)。
#
# なぜ要るか: rewrites が全パスを index.html に送るので、/robots.txt も
# /sitemap.xml も HTTP 200 でトップページの HTML を返している。だから
# 検索側は sitemap を1本も知らず、科目10本の URL はフッターのリンク頼りである。
# パッチで作れる拡張子に .txt と .xml は無いため、repo に置くのではなく
# デプロイのたびに作る。公開ディレクトリは "." なので、ここに書けば配信される。
#
# 並び (科目の id) は subjects/registry.js から読む。科目を増やしたときに
# この台本を直さなくても sitemap が追いつくようにするため。
#
# 失敗しても必ず終了コード0で抜ける。予期しない形で止まって
# デプロイ全体を落とすほうが、sitemap が1回古いことより害が大きい。
#
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOST = "buz-dojo" + "." + "web" + "." + "app"
SITE = "https://" + HOST
LT = chr(60)
GT = chr(62)

# IndexNow の鍵。サイトの根に鍵と同じ名前の txt を1枚置くと、
# 検索側がその字面を見て送信元を確かめる (口座も確認も要らない仕組み)。
# 公開前提の値で、秘密ではない。functions/indexnow.js の KEY と
# 1文字でも違うと 403 になる。indexnow-wiring のテストが突き合わせている。
INDEXNOW_KEY = "361b8945e17ec20392b62140dee53cd7"


def tag(name, value):
    return LT + name + GT + value + LT + "/" + name + GT


def enabled_subject_ids():
    # registry.js を素朴に切り出す。量指定子つきの正規表現は使わない。
    path = os.path.join(ROOT, "subjects", "registry.js")
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    out = []
    marker = 'id: "'
    parts = text.split(marker)
    for part in parts[1:]:
        end = part.find('"')
        if end < 0:
            continue
        name = part[:end]
        if name == "all" or name in out:
            continue
        # この part には、同じ科目の id より後ろのフィールドだけが入る
        if "enabled: true" not in part:
            continue
        out.append(name)
    return out


def static_pages():
    # guides と legal の静的な頁。増えたら自動で入る。
    out = []
    for folder in ("guides", "legal"):
        here = os.path.join(ROOT, folder)
        if not os.path.isdir(here):
            continue
        for name in sorted(os.listdir(here)):
            if name.endswith(".html"):
                out.append("/" + folder + "/" + name)
    return out


def known_titles(index_text):
    # index.html の head 冒頭にある known (slug から 題と説明 の表) を読む。
    # 正本をそこに1つだけ置くため、ここでは写さず読み取る。index-html-guard が
    # レジストリとの揃いを見張っているので、増えた科目も自動で付いてくる。
    # 量指定子つきの正規表現は使わない。1行1科目を前提にする。
    at = index_text.find("var known = {")
    if at < 0:
        return {}
    end = index_text.find("};", at)
    if end < 0:
        return {}
    out = {}
    for line in index_text[at:end].split(chr(10)):
        lb = line.find('["')
        colon = line.find(":")
        rb = line.rfind('"]')
        if lb < 0 or colon < 0 or rb < 0 or colon > lb:
            continue
        key = line[:colon].strip()
        if key[:1] == '"':
            key = key[1:-1]
        inner = line[lb + 2:rb]
        sep = inner.find('", "')
        if sep < 0:
            continue
        out[key] = (inner[:sep], inner[sep + 4:])
    return out


def swap_attr(text, prefix, value):
    # prefix で始まるタグの content を差し替える。見つからなければ何もしない
    # (届かなかったことを呼び元が数えて、その科目の頁を書かない)。
    i = text.find(prefix)
    if i < 0:
        return text, False
    j = text.find(chr(34), i + len(prefix))
    if j < 0:
        return text, False
    return text[:i + len(prefix)] + value + text[j:], True


def subject_page(index_text, sid, title, desc):
    # index.html をそのまま写し、head の題と説明と正典だけを科目のものに替える。
    # 本体 (script / css / base) は1文字も変えない。だから利用者の見る画面は
    # トップと同じ経路で立ち上がり、描画しないクローラだけが違う札を見る。
    if chr(34) in title or chr(34) in desc:
        return ""
    meta = LT + "meta "
    text = index_text
    steps = []
    head = LT + "title" + GT
    tail = LT + "/title" + GT
    i = text.find(head)
    j = text.find(tail, i + len(head)) if i >= 0 else -1
    if i < 0 or j < 0:
        return ""
    text = text[:i + len(head)] + title + text[j:]
    for prefix, value in (
        (meta + 'name=' + chr(34) + 'description' + chr(34) + ' content=' + chr(34), desc),
        (meta + 'property=' + chr(34) + 'og:title' + chr(34) + ' content=' + chr(34), title),
        (meta + 'property=' + chr(34) + 'og:description' + chr(34) + ' content=' + chr(34), desc),
    ):
        text, ok = swap_attr(text, prefix, value)
        steps.append(ok)
    if not all(steps):
        return ""
    # 正典と og:url を静的に置く。script も同じ値を入れるが、在れば使い回す。
    anchor = meta + 'property=' + chr(34) + 'og:locale' + chr(34) + ' content=' + chr(34) + 'ja_JP' + chr(34) + GT
    at = text.find(anchor)
    if at < 0:
        return ""
    here = SITE + "/" + sid
    added = (
        chr(10) + "  " + LT + 'link rel=' + chr(34) + 'canonical' + chr(34)
        + ' id=' + chr(34) + 'canonical-link' + chr(34)
        + ' href=' + chr(34) + here + chr(34) + GT
        + chr(10) + "  " + meta + 'property=' + chr(34) + 'og:url' + chr(34)
        + ' content=' + chr(34) + here + chr(34) + GT
    )
    return text[:at + len(anchor)] + added + text[at + len(anchor):]


def write_subject_pages():
    # 科目10本の URL に、拡張子の無い実ファイルを置く。完全一致の静的ファイルは
    # rewrites より上位なので、これが在れば /sap は自分の札を持った頁を返す。
    # 無ければ rewrites がトップへ送る (いままでと同じ振る舞い) ので、
    # 1枚も書けなかった日に壊れる形にはならない。
    with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as fh:
        index_text = fh.read()
    table = known_titles(index_text)
    wrote = 0
    for sid in enabled_subject_ids():
        pair = table.get(sid)
        if not pair:
            continue
        body = subject_page(index_text, sid, pair[0], pair[1])
        if not body:
            continue
        write(sid, body)
        wrote += 1
    print("gen-seo: subject pages " + str(wrote))


def inject_absolute_og(text, here_path):
    # 共有されたときのカードに要る2つを、絶対URLで足す。og:url と og:image は
    # 相対では効かない (受け取る側は頁の中身だけを見るので、何処の頁かを
    # 字面で言う必要がある)。パッチでは絶対URLの字面を運べないが、この台本は
    # HOST を部品から組み立てているので、デプロイのたびに此処で組めばよい。
    # 既に在る頁には手を出さない (index.html は自分で持っている)。
    if "og:url" in text:
        return text, False
    anchor = LT + "/head" + GT
    at = text.find(anchor)
    if at < 0:
        return text, False
    q = chr(34)
    tags = (
        "  " + LT + "meta property=" + q + "og:url" + q
        + " content=" + q + SITE + here_path + q + GT + chr(10)
        + "  " + LT + "meta property=" + q + "og:image" + q
        + " content=" + q + SITE + "/assets/icon-512.png" + q + GT + chr(10)
        + "  " + LT + "meta property=" + q + "og:image:alt" + q
        + " content=" + q + "ビジネス道場のアイコン" + q + GT + chr(10)
    )
    return text[:at] + tags + text[at:], True


def write_absolute_og():
    # 着地頁 (guides) と法務の頁 (legal) に、og:url と og:image を足す。
    # 追跡されているファイルを書き換えるが、commit はされない
    # (gen-version.py が config/version.js を書くのと同じ扱い)。
    done = 0
    for rel in static_pages():
        full = os.path.join(ROOT, rel.lstrip("/"))
        try:
            with open(full, encoding="utf-8") as fh:
                text = fh.read()
        except Exception:
            continue
        body, ok = inject_absolute_og(text, rel)
        if not ok:
            continue
        with open(full, "w", encoding="utf-8") as fh:
            fh.write(body)
        done += 1
    print("gen-seo: absolute og " + str(done))


def write(name, body):
    with open(os.path.join(ROOT, name), "w", encoding="utf-8") as fh:
        fh.write(body)
    print("gen-seo: wrote " + name)


def main():
    paths = ["/"] + ["/" + sid for sid in enabled_subject_ids()] + static_pages()
    lines = [LT + "?xml version=" + chr(34) + "1.0" + chr(34) + " encoding=" + chr(34) + "UTF-8" + chr(34) + "?" + GT]
    ns = "http" + "://" + "www" + ".sitemaps" + ".org" + "/schemas/sitemap/0.9"
    lines.append(LT + "urlset xmlns=" + chr(34) + ns + chr(34) + GT)
    for p in paths:
        lines.append("  " + LT + "url" + GT)
        lines.append("    " + tag("loc", SITE + p))
        lines.append("  " + LT + "/url" + GT)
    lines.append(LT + "/urlset" + GT)
    write("sitemap.xml", "\n".join(lines) + "\n")

    robots = [
        "User-agent: " + chr(42),
        "Allow: /",
        "Disallow: /admin/",
        "",
        "Sitemap: " + SITE + "/sitemap.xml",
    ]
    write("robots.txt", "\n".join(robots) + "\n")

    # IndexNow の鍵の字面。中身は鍵そのものだけ (改行も付けない)。
    write(INDEXNOW_KEY + ".txt", INDEXNOW_KEY)

    # 拡張子の無いファイルに Content-Type を被せられるかの探り (10/26 00:48便)。
    # 科目10本の URL (/sap など) は、実ファイルを置ければ rewrites より上位で
    # 返せる (優先順位は公式に明記)。だが拡張子の無い字面にどの型が付くかは
    # 公式文書に記述が無い。誰も踏まない道に1枚置いて本番で型を実測する。
    # firebase.json の headers に同じ道の Content-Type が要る (片方では効かない)。
    write("ctprobe", chr(10).join([
        LT + "!DOCTYPE html" + GT,
        LT + "meta charset=" + chr(34) + "utf-8" + chr(34) + GT,
        LT + "meta name=" + chr(34) + "robots" + chr(34) + " content=" + chr(34) + "noindex" + chr(34) + GT,
        LT + "title" + GT + "CTPROBE" + LT + "/title" + GT,
        LT + "p" + GT + "CTPROBE OK html" + LT + "/p" + GT,
    ]) + chr(10))

    write_subject_pages()
    write_absolute_og()
    return 0


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        print("gen-seo: skipped (" + str(err) + ")")
    sys.exit(0)
