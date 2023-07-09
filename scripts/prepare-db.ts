import decompressResponse from "decompress-response";
import https from "node:https";

import { db } from "../server/db/index.js";

// import Module from "node:module";
// const require = Module.createRequire(import.meta.url);

function fetchGzip(url: string, cb: (r: string) => void) {
  https
    .get(url, (resp) => {
      resp.headers["content-encoding"] = "gzip";

      let s = "";
      const r = decompressResponse(resp);

      const push = (t: string) => {
        const ss = (s + t).split("\n");
        s = ss.pop() || s;
        ss.map((t) => {
          if (t) cb(t.trimEnd());
        });
      };

      r.once("error", () => {
        cb("");
      });
      r.on("data", (c: Buffer) => {
        push(c.toString("utf-8"));
      });
      r.once("end", () => {
        push(s);
        cb("");
      });
    })
    .on("error", () => {
      cb("");
    });
}

db.runAndClose(async (db) => {
  const checkCedict = async () => {
    const META_ID = "cedict";

    const cols = db.db.dict.col();

    const meta = await cols.meta.findOne({ _id: META_ID });
    if (meta) {
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - 7);
      if (meta.updated > threshold) return;
    }

    const items: any[] = [];
    let updated: Date | null = null;
    const re = new RegExp("^(.+?) (.+?) \\[(.+?)\\] /(.+)/$");

    await new Promise((resolve) => {
      fetchGzip(
        "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz",
        (s) => {
          if (!s) resolve(null);
          if (s[0] === "#") {
            const [, dateStr] = s.split("#! date=");
            if (dateStr) {
              const d = new Date(dateStr);
              if (meta && meta.updated > d) {
                resolve(null);
              }
              updated = d;
            }
            return;
          }
          const m = re.exec(s);
          if (m) {
            let [, traditional, simplified, pinyin, gloss] = m;
            const it: any = { simplified, pinyin };
            it.gloss = gloss.replaceAll("/", "\n");
            if (traditional !== simplified) {
              Object.assign(it, { traditional });
            }
            it.key = db.db.dict.fn.cedict.makeKey(it);
            items.push(it);
          }
        },
      );
    });

    if (updated && items.length) {
      const session = db.mongo.startSession();
      try {
        session.startTransaction({
          readConcern: { level: "snapshot" },
          writeConcern: { w: "majority" },
          readPreference: "primary",
        });

        await cols.cedict.deleteMany(
          {
            key: { $in: items.map((it) => it.key) },
          },
          { session },
        );

        const batchSize = 10000;
        for (let i = 0; i < items.length; i += batchSize) {
          await cols.cedict.insertMany(items.slice(i, i + batchSize), {
            ordered: false,
            session,
          });
          console.log(i);
        }

        if (meta) {
          await cols.meta.updateOne({ _id: META_ID }, { updated }, { session });
        } else {
          await cols.meta.insertOne({ _id: META_ID, updated }, { session });
        }

        await session.commitTransaction();
      } catch (e) {
        console.error(e);
        await session.abortTransaction();
      } finally {
        await session.endSession();
      }
    }
  };
  await checkCedict();

  const checkTatoeba = async () => {};
}).then(() => {
  console.log("Done");
  setTimeout(() => {
    process.exit(0);
  }, 5000);
});
