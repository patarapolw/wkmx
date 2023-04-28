import { db } from "../server/db/index.js";
import https from "node:https";

// import Module from "node:module";
// const require = Module.createRequire(import.meta.url);

function fetchGzip(url: string, cb: (r: string) => void) {
  import("decompress-response").then(({ default: decompressResponse }) => {
    https.get(url, (resp) => {
      let s = "";
      const r = decompressResponse(resp);
      r.once("error", () => {
        cb("");
      });
      r.on("data", (c) => {
        const [s1, s2] = (s + c.toString()).split("\n");
        if (s2) {
          cb(s1);
          s = s2;
        } else {
          s = s1;
        }
      });
      r.once("end", () => {
        cb(s.trimEnd());
      });
    });
  });
}

db.connect().then(async (db) => {
  const checkCedict = async () => {
    const meta = await db.col.zh.meta.findOne({ _id: "cedict" });
    if (meta) {
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - 7);
      if (meta.updated > threshold) return;
    }

    const items: any[] = [];
    let updated: Date | null = null;
    const re = new RegExp("^(.+?) (.+?) \\[(.+?)\\] (.+)$");

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
            const it = { simplified, pinyin, gloss };
            if (traditional !== simplified) {
              Object.assign(it, { traditional });
            }
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

        await db.col.zh.cedict.deleteMany(
          {
            key: { $in: items.map((it) => db.func.zh.cedict.makeKey(it)) },
          },
          { session },
        );
        await db.col.zh.cedict.insertMany(items, { ordered: false, session });

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
});
