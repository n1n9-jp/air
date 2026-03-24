air
===

「air」は、東京都が提供するリアルタイムの大気質データを可視化するプロジェクトです。
主なコンポーネントは以下の通りです：
   * [www.kankyo.metro.tokyo.jp](http://www.kankyo.metro.tokyo.jp) から大気データを抽出するスクレイパー
   * データを保存するPostgreSQLデータベース
   * データおよび静的ファイルをクライアントに配信するExpress.jsサーバー
   * データを補間し、アニメーション風向マップを描画するクライアントアプリ

「air」のインスタンスは http://air.nullschool.net で公開されています。現在、
[Amazon Web Services](http://aws.amazon.com) でホスティングされ、
[CloudFlare](https://www.cloudflare.com) をフロントに使用しています。

「air」は、JavaScript、Node.js、when.js、PostgreSQL、D3、ブラウザプログラミングを
学ぶために作った個人プロジェクトです。設計上の判断の中には、単に新しいことを試すために
行ったものもあります（例：PostgreSQL）。経験不足による判断もあったと思います。
フィードバックは大歓迎です！

ビルドと起動
----------------------

プロジェクトをクローンし、npmからライブラリをインストールします：

    npm install

注意：[pg](https://github.com/brianc/node-postgres) をビルドするには
[libpq](http://www.postgresql.org/docs/9.3/static/libpq.html) が必要です。
libpqライブラリはMac OS Xではpostgresにより自動的にインストールされましたが、
AWSでは別途インストールが必要でした。

PostgreSQLをインストールし、以下のようにデータベースを作成します：

    CREATE DATABASE air
      WITH OWNER = postgres
           ENCODING = 'UTF8'
           TABLESPACE = pg_default
           LC_COLLATE = 'en_US.UTF-8'
           LC_CTYPE = 'en_US.UTF-8'
           CONNECTION LIMIT = -1;

サーバーを起動します：

    node server.js <port> <postgres-connection-string> <air-data-url>

例：

    node server.js 8080 postgres://postgres:12345@localhost:5432/air <air-data-url>

最後に、ブラウザでサーバーにアクセスします：

    http://localhost:8080

実装メモ
--------------------

このプロジェクトの構築には、いくつかの興味深い問題の解決が必要でした。以下にいくつか紹介します：

   * ライブの大気データはShift_JISエンコードのHTMLで提供されています。Node.jsはShift_JISを
     ネイティブにサポートしていないため、[iconv](https://github.com/bnoordhuis/node-iconv)
     ライブラリを使用してUTF-8への変換を行っています。
   * 東京の地理データは、国土交通省から直接取得した80MBのXMLファイルが元になっています。
     このデータを300KBの [TopoJSON](https://github.com/mbostock/topojson) ファイルに変換し、
     ブラウザがダウンロードして [D3](http://d3js.org/) でSVGとして描画できるサイズにしました。
   * 約50の測定局が、1時間ごとの風向・風速および汚染物質データを提供しています。
     [逆距離加重法（IDW）](http://en.wikipedia.org/wiki/Inverse_distance_weighting)
     補間を使用して、東京全域をカバーする風のベクトル場を構築しています。IDWは不自然な
     アーティファクトを生じ、時代遅れとされていますが、非常にシンプルでベクトル補間への
     拡張も容易でした。
   * ブラウザは各点 (x, y) をn個の最近傍測定局を使って補間します。n個の最近傍を
     決定するために、クライアントは [k-d木](http://en.wikipedia.org/wiki/K-d_tree) を
     構築し、パフォーマンスを大幅に向上させています。
   * 汚染物質の可視化オーバーレイには [薄板スプライン（TPS）](http://en.wikipedia.org/wiki/Thin_plate_spline)
     補間を使用しています。TPSは大気汚染物質のような自然現象に使うには明らかに不適切な
     手法ですが、IDWよりも滑らかな表面を生成します。
   * 東京のSVGマップの上にHTML5 Canvasを重ね、そこにアニメーションを描画しています。
     アニメーションレンダラーは、SVGエンジンが描画した東京の境界がどこにあるかを知る
     必要がありますが、SVG要素からこのピクセル単位の情報を直接取得するのは困難です。
     この問題を回避するために、東京のポリゴンを非表示のCanvas要素に再描画し、そのCanvasの
     ピクセルをマスクとして使用して、マップ内の点と外の点を区別しています。フィールド
     マスクは赤色チャンネルに、表示マスクは緑色チャンネルにエンコードされています。
   * ブラウザで [when.js](https://github.com/cujojs/when) を使用しました。楽しい
     実験だったからです。

インスピレーション
-----------

このプロジェクトの主なインスピレーションは、素晴らしい [hint.fmの風マップ](http://hint.fm/wind/)
から得ました。そして、とても分かりやすいD3チュートリアル
[Let's Make a Map](http://bost.ocks.org/mike/map/) が、始めるのがいかに簡単かを教えてくれました。
