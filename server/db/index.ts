import { MongoClient, ServerApiVersion } from "mongodb";

class DbMongo {
  mongo = new MongoClient(process.env["MONGO_URI"]!, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  db = {
    user: this.mongo.db("user"),
    data: this.mongo.db("data"),
    zh: this.mongo.db("zh"),
  };

  col = {
    user: {
      user: this.db.user.collection<{
        _id: string; // WaniKani user ID
        username: string;
        level: string;
        settings: {
          vocabPerHanzi: number;
          ignoreWanikaniLevel: boolean;
        };
      }>("user"),
      item: this.db.user.collection<{
        user: string;
        itemId: string;
        type: string;
        item: string[];
        reading: string[];
        meaning: string[];
        quiz: {
          srs: number;
          nextReview: Date;
        } | null;
      }>("item"),
      sentence: this.db.user.collection<{
        user: string;
        itemId: string;
        sentence: string;
        vocabularies: string[];
        translation: string;
      }>("sentence"),
    },
    data: {
      meta: this.db.data.collection<{
        _id: string;
        updated: Date;
      }>("meta"),
      character: this.db.data.collection<{
        sub: string[];
        sup: string[];
        var: string[];
        entry: string;
      }>("character"),
      sentence: this.db.data.collection<{
        tatoebaId: number;
        lang: "cmn" | "jpn" | "eng";
        translationIds: number[];
        text: string;
        fulltext?: string;
        vocabularies?: string[];
        tags: string[];
      }>("sentence"),
    },
    zh: {
      meta: this.db.zh.collection<{
        _id: string;
        updated: Date;
      }>("meta"),
      cedict: this.db.zh.collection<{
        traditional?: string;
        simplified: string;
        pinyin: string[];
        gloss: string;
      }>("cedict"),
    },
  };

  async connect(): Promise<this> {
    await this.mongo.connect();

    await Promise.allSettled([
      ...((col) => {
        return [col.createIndex({ username: 1 }, { unique: true })];
      })(this.col.user.user),
      ...((col) => {
        return [
          col.createIndex({ user: 1, itemId: 1 }, { unique: true }),
          col.createIndex({ item: 1 }),
          col.createIndex({ reading: 1 }),
          col.createIndex({ meaning: 1 }),
          col.createIndex({ "quiz.srs": 1 }),
          col.createIndex({ "quiz.nextReview": 1 }),
        ];
      })(this.col.user.item),
      ...((col) => {
        return [
          col.createIndex({ user: 1, itemId: 1 }, { unique: true }),
          col.createIndex({ sentence: 1 }),
          col.createIndex({ vocabularies: 1 }),
          col.createIndex({ translation: "text" }),
        ];
      })(this.col.user.sentence),
      ...((col) => {
        return [col.createIndex({ updated: 1 })];
      })(this.col.data.meta),
      ...((col) => {
        return [
          col.createIndex({ sub: 1 }),
          col.createIndex({ sup: 1 }),
          col.createIndex({ var: 1 }),
          col.createIndex({ entry: 1 }, { unique: true }),
        ];
      })(this.col.data.character),
      ...((col) => {
        return [
          col.createIndex({ tatoebaId: 1 }, { unique: true }),
          col.createIndex({ lang: 1 }),
          col.createIndex({ translationIds: 1 }),
          col.createIndex({ fulltext: "text" }),
          col.createIndex({ vocabularies: 1 }),
          col.createIndex({ tags: 1 }),
        ];
      })(this.col.data.sentence),
      ...((col) => {
        return [col.createIndex({ updated: 1 })];
      })(this.col.zh.meta),
      ...((col) => {
        return [
          col.createIndex({ traditional: 1 }),
          col.createIndex({ simplified: 1 }),
          col.createIndex(
            { pinyin: 1 },
            {
              collation: { locale: "simple", strength: 1 },
            },
          ),
          col.createIndex({ gloss: "text" }),
        ];
      })(this.col.zh.cedict),
    ]);

    return this;
  }
}

export const db = new DbMongo();
