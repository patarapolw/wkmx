import { MongoClient, ServerApiVersion } from "mongodb";

type ID = string;

class DbMongo {
  mongo = new MongoClient(process.env["MONGO_URI"]!, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  db = {
    user: {
      db: this.mongo.db("user"),
      col(init?: () => void) {
        const cols = {
          user: this.db.collection<{
            _id: ID; // WaniKani user ID
            username: string;
            passwordHash: string;
            wanikani?: {
              apiKeyHash: string;
              level: string;
              vocabPerHanzi: number;
              ignoreLevel?: boolean;
            };
            settings?: {
              vocabPerHanzi?: number;
            };
          }>("user"),
          item: this.db.collection<{
            ID: ID; // unique (ID, user)
            userID: ID;
            type: string;
            item: string[];
            reading: string[];
            meaning: string[];
            quiz: {
              srs: number;
              nextReview: Date;
            } | null;
          }>("item"),
          sentence: this.db.collection<{
            ID: ID; // unique (ID, user)
            user: string;
            sentence: string;
            itemIDs: ID[]; // ref item.ID
            translation: string;
          }>("sentence"),
        };

        if (init) {
          Promise.allSettled([
            ...((col) => {
              return [
                col.createIndex({ username: 1 }, { unique: true }),
                col.createIndex({ passwordHash: 1 }),
                col.createIndex({ "wanikani.apiKeyHash": 1 }),
              ];
            })(cols.user),
            ...((col) => {
              return [
                col.createIndex({ ID: 1, userID: 1 }, { unique: true }),
                col.createIndex({ item: 1 }),
                col.createIndex({ reading: 1 }),
                col.createIndex({ meaning: 1 }),
                col.createIndex({ "quiz.srs": 1 }),
                col.createIndex({ "quiz.nextReview": 1 }),
              ];
            })(cols.item),
            ...((col) => {
              return [
                col.createIndex({ ID: 1, userID: 1 }, { unique: true }),
                col.createIndex({ sentence: 1 }),
                col.createIndex({ itemIDs: 1 }),
                col.createIndex({ translation: "text" }),
              ];
            })(cols.sentence),
          ]);
        }

        return cols;
      },
    },
    dict: {
      db: this.mongo.db("dict"),
      col(init?: () => void) {
        const cols = {
          meta: this.db.collection<{
            _id: ID;
            updated: Date;
          }>("meta"),
          radical: this.db.collection<{
            entry: string; // unique
            sub: string[];
            sup: string[];
            var: string[];
          }>("radical"),
          sentence: this.db.collection<{
            _id: ID; // tateobaID, unique
            lang: "cmn" | "jpn" | "eng";
            translationIDs: ID[];
            text: string;
            fulltext?: string;
            vocabularies?: string[];
            tags: string[];
          }>("sentence"),
          cedict: this.db.collection<{
            key: string; // not necessarily unique
            traditional?: string;
            simplified: string;
            pinyin: string;
            english: string[];
          }>("cedict"),
        };

        if (init) {
          Promise.allSettled([
            ...((col) => {
              return [col.createIndex({ updated: 1 })];
            })(cols.meta),
            ...((col) => {
              return [
                col.createIndex({ entry: 1 }, { unique: true }),
                col.createIndex({ sub: 1 }),
                col.createIndex({ sup: 1 }),
                col.createIndex({ var: 1 }),
              ];
            })(cols.radical),
            ...((col) => {
              return [
                col.createIndex({ lang: 1 }),
                col.createIndex({ translationIDs: 1 }),
                col.createIndex({ fulltext: "text" }),
                col.createIndex({ vocabularies: 1 }),
                col.createIndex({ tags: 1 }),
              ];
            })(cols.sentence),
            ...((col) => {
              return [
                col.createIndex({ key: 1 }),
                col.createIndex({ traditional: 1 }),
                col.createIndex({ simplified: 1 }),
                col.createIndex(
                  { pinyin: 1 },
                  {
                    collation: { locale: "simple", strength: 1 },
                  },
                ),
                col.createIndex({ english: "text" }),
              ];
            })(cols.cedict),
          ]).finally(init);
        }

        return cols;
      },
      fn: {
        cedict: {
          makeKey: (o: {
            traditional?: string;
            simplified: string;
            pinyin: string;
          }) => {
            return `${o.pinyin} ${o.simplified} ${o.traditional || ""}`;
          },
        },
      },
    },
  };

  async connect(): Promise<this> {
    await this.mongo.connect();

    await Promise.allSettled([
      new Promise<void>((resolve) => {
        this.db.user.col(resolve);
      }),
      new Promise<void>((resolve) => {
        this.db.dict.col(resolve);
      }),
    ]);

    return this;
  }

  async disconnect() {
    return this.mongo.close();
  }

  async runAndClose(fn: (db: this) => Promise<void>) {
    await this.connect();
    await fn(this);
    await this.disconnect();
  }
}

export const db = new DbMongo();
