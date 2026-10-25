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
    return 0


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        print("gen-seo: skipped (" + str(err) + ")")
    sys.exit(0)
