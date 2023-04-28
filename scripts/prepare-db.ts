import { db } from "~/server/db";
import https from "node:https";
import decompressResponse from "decompress-response";

function fetchGzip(url: string, cb: (r: string) => void) {
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
}

db.connect().then(async (db) => {
  const checkCedict = async () => {
    const meta = await db.col.zh.meta.findOne({ _id: "cedict" });
    if (meta) {
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - 7);
      if (meta.updated > threshold) return;
    }

    return new Promise((resolve) => {
      fetchGzip(
        "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz",
        (s) => {
          if (!s) resolve(null);
        },
      );
    });
  };
  await checkCedict();
});
