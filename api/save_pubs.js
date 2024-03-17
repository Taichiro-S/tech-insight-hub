const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
// Firebase Admin SDKの初期化
const serviceAccount = require('./serviceAccountKey.json');
const fileName = 'publication_articles8.json';
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const filePath = path.join(__dirname, fileName);
const rawData = fs.readFileSync(filePath, 'utf8');
const publications = JSON.parse(rawData);

const db = admin.firestore();


async function uploadData(publications) {
    let batch = db.batch();
    let operationCount = 0;


    
    for (const [publicationName, articles] of Object.entries(publications)) {
        console.log(`Uploading articles for ${publicationName}`);
        let likes = 0;
        let comments = 0;
        let topicsCounts = {};

      if (articles.length > 0) {
        const publicationData = articles[0].publication; // 最初の記事からpublicationの情報を取得
        const publicationRef = db.collection('publications').doc(publicationData.id.toString());
        batch.set(publicationRef, {
            ...publicationData,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        operationCount++;

        for (const article of articles) {
            likes += article.liked_count;
            comments += article.comments_count;
            for (const topic of article.topics) {
                topicsCounts[topic.display_name] = (topicsCounts[topic.display_name] || 0) + 1;
            }
          const { publication, topics, ...articleData } = article;
          const articleRef = publicationRef.collection('articles').doc(article.slug);
          batch.set(articleRef, articleData, { merge: true });
          operationCount++;
          for (const topic of article.topics) {
            const topicsRef = articleRef.collection('topics').doc(topic.id.toString());
            batch.set(topicsRef, topic, { merge: true });
            operationCount++;
            if (operationCount >= 500) {
                await batch.commit();
                batch = db.batch();
                operationCount = 0;
              }
          }
        }
        
        batch.set(publicationRef, {
            articlesCount: articles.length,
            likes,
            comments,
            topicsCounts,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
          operationCount++;

          if (operationCount >= 500) {
            await batch.commit();
            batch = db.batch();
            operationCount = 0;
          }
 
      }

    }
      // 残りのバッチをコミット
  if (operationCount > 0) {
    await batch.commit();
  }
    console.log('Data upload complete');
  }
  
  uploadData(publications).catch(console.error);