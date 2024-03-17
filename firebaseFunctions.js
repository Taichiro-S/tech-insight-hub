const { join } = require("path");
const { https } = require("firebase-functions");
const next = require('next')
const axios = require('axios');
const xml2js = require('xml2js');
const zlib = require('zlib');
const util = require('util');
const admin = require('firebase-admin');
const functions = require('firebase-functions');

const nextjsDistDir = join("src", require("./src/next.config.js").distDir);

const nextjsServer = next({
  dev: false,
  conf: {
    distDir: nextjsDistDir,
  },
});
const nextjsHandle = nextjsServer.getRequestHandler();

exports.nextjsFunc = https.onRequest((req, res) => {
  return nextjsServer.prepare().then(() => nextjsHandle(req, res));
});

admin.initializeApp();

const gunzipAsync = util.promisify(zlib.gunzip);

async function fetchAndParseGzipXML(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const gzippedData = response.data;
    const xmlData = await gunzipAsync(gzippedData);
    const xmlString = xmlData.toString();
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlString);
    const urls = result.urlset.url.map((u) => u.loc[0]);
    return urls;
  } catch (error) {
    console.error('Error fetching or parsing the gzip XML:', error);
    throw error;
  }
}

async function savePublicationNames(publicationNames) {
  const db = admin.firestore();
  const batch = db.batch();

  publicationNames.forEach((name, index) => {
    const docRef = db.collection('publications').doc(`pub_${index}`);
    batch.set(docRef, { name, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  });

  await batch.commit();
}


async function fetchpubs() {
  const publicationUrl = 'https://zenn.dev/sitemaps/publication1.xml.gz';
  try {
    const urls = await fetchAndParseGzipXML(publicationUrl);
    const publicationNames = urls.map((url) => url.split('/').pop());
    await savePublicationNames(publicationNames);
  } catch (error) {
    console.error('Failed to fetch or parse publication URLs:', error);
  }
}

async function fetchAndSaveArticles() {
  const db = admin.firestore();
  const publicationsRef = db.collection('publications');
  const publicationsSnapshot = await publicationsRef.get();
  const pubArticles = []
  try{
  for (const doc of publicationsSnapshot.docs) {
    const allArticles = []
    const name = doc.data().name;
    let page = 1
    while (true) {
      const url = `https://zenn.dev/api/articles?order=latest&count=10&publication_name=${name}&page=${page}`
      const response = await axios.get(url)
      const articles = response.data.articles
      const hasNext = response.data.next_page
      for (const article of articles) {
        const articleDetailsResponse = await axios.get(`https://zenn.dev/api/articles/${article.slug}`);
        const articleDetails = articleDetailsResponse.data.article;
        const topics = articleDetails.topics;
        allArticles.push(article.title)
      }
      if (!hasNext) {
        break
      }
      console.log(`Fetching articles from ${name}... page: ${page}`)
      page++
    }
  }
    
    } catch (error) {
      console.error("Error fetching or saving articles and topics:", error);
    }
}

exports.scheduledFetchAndParse =  functions
  .region('asia-northeast1')
  .runWith({ timeoutSeconds: 300 })
  .pubsub
  .schedule('50 17 * * *')
  .timeZone('Asia/Tokyo')
  .onRun(async (context) => {
    try {
      fetchpubs();
    } catch (error) {
      console.error('Failed to fetch and parse Zenn tags:', error);
    }
});

exports.scheduledFetchPubsInfo =  functions
  .region('asia-northeast1')
  .runWith({ timeoutSeconds: 300 })
  .pubsub
  .schedule('50 17 * * *')
  .timeZone('Asia/Tokyo')
  .onRun(async (context) => {
    try {
      fetchAndSaveArticles();
    } catch (error) {
      console.error('Failed to fetch and parse Zenn tags:', error);
    }
});

