import SevenZip from "7zip-min";
import sqlite3 from "better-sqlite3";
import { createReadStream, createWriteStream, mkdirSync } from "fs";
import https from "node:https";
import { join as joinPath } from "path";
import { promisify } from "util";

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
    `);
  }

  async download() {
    await this.getLinks();
  }

  async getLinks() {
    const cwd = process.cwd();

    try {
      process.chdir(this.dir);
      const zipFile = "links.tar.bz2";
      // await new Promise((resolve, reject) => {
      //   https
      //     .get("https://downloads.tatoeba.org/exports/links.tar.bz2", (resp) => {
      //       const fileStream = createWriteStream(zipFile);
      //       resp.pipe(fileStream);
      //       fileStream.once("error", reject).once("finish", () => {
      //         fileStream.close();
      //         resolve(null);
      //       });
      //     })
      //     .once("error", reject);
      // });

      await promisify(SevenZip.unpack)(zipFile);
      await promisify(SevenZip.unpack)(zipFile.replace(/\.bz2$/, ""));

      const textFile = "links.csv"; // Fixed filename. Do not change.
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

        const fileStream = createReadStream(textFile, "utf-8");
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
    const zipFile = joinPath(this.dir, `${lang}.tar.bz2`);
    await new Promise((resolve, reject) => {
      https
        .get(
          `https://downloads.tatoeba.org/exports/per_language/${lang}/${lang}_sentences.tsv.bz2`,
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

    const txtFile = joinPath(this.dir);
  }
}

(async function main() {
  const t = new Tatoeba(".tmp");
  await t.getLinks();
  console.log(
    t.sql
      .prepare(
        /* sql */ `
SELECT n1, group_concat(n2) FROM links GROUP BY n1
`,
      )
      .all(),
  );
})();
