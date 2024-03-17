const { join } = require('path')
const { https } = require('firebase-functions')
const next = require('next')
const axios = require('axios')
const xml2js = require('xml2js')
const zlib = require('zlib')
const util = require('util')
const admin = require('firebase-admin')
const functions = require('firebase-functions')

const nextjsDistDir = join('src', require('./src/next.config.js').distDir)

const nextjsServer = next({
  dev: false,
  conf: {
    distDir: nextjsDistDir
  }
})
const nextjsHandle = nextjsServer.getRequestHandler()

exports.nextjsFunc = https.onRequest((req, res) => {
  return nextjsServer.prepare().then(() => nextjsHandle(req, res))
})

admin.initializeApp()

const gunzipAsync = util.promisify(zlib.gunzip)

// 毎日0時にZennから企業名のリストを取得してFirestoreに保存する
exports.savePubNames = functions
  .region('asia-northeast1')
  .runWith({ timeoutSeconds: 300 })
  .pubsub.schedule('0 0 * * *')
  .timeZone('Asia/Tokyo')
  .onRun(async (context) => {
    try {
      const publicationUrl = 'https://zenn.dev/sitemaps/publication1.xml.gz'
      // サイトマップから企業名のリストを取得
      const response = await axios.get(publicationUrl, { responseType: 'arraybuffer' })
      const gzippedData = response.data
      const xmlData = await gunzipAsync(gzippedData)
      const xmlString = xmlData.toString()
      const parser = new xml2js.Parser()
      const result = await parser.parseStringPromise(xmlString)
      const urls = result.urlset.url.map((u) => u.loc[0])
      const publicationNames = urls.map((url) => url.split('/').pop())

      // Firestoreに企業名を保存
      const db = admin.firestore()
      let batch = db.batch()
      let count = 1
      publicationNames.forEach((name, index) => async () => {
        const docRef = db.collection('publication_names').doc(index)
        batch.set(docRef, { name, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
        count++
        if (count >= 500) {
          await batch.commit() // 現在のバッチを実行
          batch = db.batch() // 新しいバッチを作成
          count = 1 // カウントをリセット
        }
      })
      if (count > 1) {
        await batch.commit()
      }
    } catch (error) {
      console.error('ERROR:', error)
    }
  })
