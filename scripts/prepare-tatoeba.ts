import SevenZip from "7zip-min";
import sqlite3 from "better-sqlite3";
import { createReadStream, createWriteStream, mkdirSync } from "fs";
import https from "node:https";
import jieba from "nodejieba";
import { join as joinPath } from "path";
import wakachigaki from "wakachigaki";

jieba.load({
  userDict: "./assets/trad.dict.txt",
});

export class Tatoeba {
  sql: ReturnType<typeof sqlite3>;

  constructor(public dir = ".tmp") {
    try {
      mkdirSync(this.dir, { recursive: true });
    } catch (e) {}

    this.sql = sqlite3(joinPath(this.dir, "tatoeba.db"));
    this.sql.exec(/* sql */ `
      CREATE TABLE IF NOT EXISTS links (
        n1  INTEGER NOT NULL,
        n2  INTEGER NOT NULL,
        PRIMARY KEY (n1, n2)
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS sentence USING fts5 (
        lang,
        full UNINDEXED,
        word
      );
    `);
  }

  async download() {
    // await this.getLinks();
    await this.getSentences("eng");
    await this.getSentences("cmn");
    await this.getSentences("jpn");
  }

  async getLinks() {
    const cwd = process.cwd();

    try {
      process.chdir(this.dir);
      const zipFile = "links.tar.bz2";
      await new Promise((resolve, reject) => {
        https
          .get(
            "https://downloads.tatoeba.org/exports/links.tar.bz2",
            (resp) => {
              const fileStream = createWriteStream(zipFile);
              resp.pipe(fileStream);
              fileStream.once("error", reject).once("finish", () => {
                fileStream.close();
                resolve(null);
              });
            },
          )
          .once("error", reject);
      });

      await new Promise((r, s) =>
        SevenZip.unpack(zipFile, (e) => (e ? s(e) : r(null))),
      );

      await new Promise((r, s) =>
        SevenZip.unpack(zipFile.replace(/\.bz2$/, ""), (e) =>
          e ? s(e) : r(null),
        ),
      );

      const textFile = "links.csv"; // Fixed filename. Do not change.
      const fileStream = createReadStream(textFile, "utf-8");

      await new Promise((resolve, reject) => {
        const stack: any[] = [];
        const stackBatch = 1000;
        const stmt = this.sql.prepare(/* sql */ `
          INSERT INTO links (n1, n2) VALUES (@n1, @n2)
          ON CONFLICT DO NOTHING;
        `);
        const commitStack = this.sql.transaction((ss: any[]) => {
          ss.map((s) => stmt.run(s));
        });

        const cb = (row: string) => {
          const [t1, t2] = row.split("\t", 2);
          if (!t1 || !t2) return;

          const [n1, n2] = [Number(t1), Number(t2)];
          if (isNaN(n1) || isNaN(n2)) return;

          stack.push({ n1, n2 });
          if (stack.length > stackBatch) {
            commitStack(stack.splice(0, stackBatch));
          }
        };

        let s = "";
        const push = (t: string) => {
          const ss = (s + t).split("\n");
          s = ss.pop() || s;
          ss.map((t) => {
            if (t) cb(t.trimEnd());
          });
        };

        fileStream
          .once("error", reject)
          .once("end", resolve)
          .on("data", (c) => {
            push(c.toString());
            commitStack(stack);
          });
      });
    } finally {
      process.chdir(cwd);
    }
  }

  async getSentences(lang: "cmn" | "jpn" | "eng") {
    const cwd = process.cwd();

    try {
      process.chdir(this.dir);
      // const zipFile = joinPath(`${lang}.tsv.bz2`);
      // await new Promise((resolve, reject) => {
      //   https
      //     .get(
      //       `https://downloads.tatoeba.org/exports/per_language/${lang}/${lang}_sentences.tsv.bz2`,
      //       (resp) => {
      //         const fileStream = createWriteStream(zipFile);
      //         resp.pipe(fileStream);
      //         fileStream.once("error", reject).once("finish", () => {
      //           fileStream.close();
      //           resolve(null);
      //         });
      //       },
      //     )
      //     .once("error", reject);
      // });

      // await new Promise((r, s) =>
      //   SevenZip.unpack(zipFile, (e) => (e ? s(e) : r(null))),
      // );

      const textFile = `${lang}.tsv`;
      const fileStream = createReadStream(textFile, "utf-8");

      this.sql
        .prepare(/* sql */ `DELETE FROM sentence WHERE lang = ?`)
        .run(lang);

      await new Promise((resolve, reject) => {
        const stack: any[] = [];
        const stackBatch = 1000;
        const stmt = this.sql.prepare(/* sql */ `
          INSERT INTO sentence (rowid, lang, full, word) VALUES (@id, @lang, @full, @word);
        `);
        const commitStack = this.sql.transaction((ss: any[]) => {
          ss.map((s) => stmt.run(s));
        });

        const cb = (row: string) => {
          const [idStr, lang, full = ""] = row.split("\t");
          const id = Number(idStr);

          if (!id) return;

          let word = full;
          switch (lang) {
            case "cmn":
              word = jieba.cutForSearch(full.replace(/\p{P}/gu, "")).join(" ");
              break;
            case "jpn":
              word = wakachigaki
                .tokenize(full.replace(/\p{P}/gu, ""))
                .join(" ");
              break;
          }

          stack.push({ id, lang, full, word });
          if (stack.length > stackBatch) {
            commitStack(stack.splice(0, stackBatch));
          }
        };

        let s = "";
        const push = (t: string) => {
          const ss = (s + t).split("\n");
          s = ss.pop() || s;
          ss.map((t) => {
            if (t) cb(t.trimEnd());
          });
        };

        fileStream
          .once("error", reject)
          .once("end", () => {
            commitStack(stack);
            resolve(null);
          })
          .on("data", (c) => {
            push(c.toString());
          });
      });
    } finally {
      process.chdir(cwd);
    }
  }
}

(async function main() {
  const t = new Tatoeba(".tmp");
  await t.download();
})();
