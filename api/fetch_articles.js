const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function writeInitialBracket(filename) {
  await fs.writeFile(filename, '{\n', 'utf8');
}

async function appendToFile(filename, name, data, isLast) {
  const comma = isLast ? '' : ',';
  await fs.appendFile(filename, `"${name}": ${JSON.stringify(data, null, 2)}${comma}\n`, 'utf8');
}

async function writeFinalBracket(filename) {
  await fs.appendFile(filename, '}', 'utf8');
}

async function loadPublicationNames() {
  try {
    const filePath = path.join(__dirname, 'publication_names.json');
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading publication names:', error);
    throw error;
  }
}

async function fetchArticles(publicationNames, filename) {
    await writeInitialBracket(filename);
    let i = 1
    for (const name of publicationNames) {
      console.log(`Fetching articles from ${name} ${i}/${publicationNames.length}`)

      const allArticles = []
      let page = 1
      let hasNext = true;

      while (hasNext) {
        try {
          const url = `https://zenn.dev/api/articles?order=latest&count=100&publication_name=${name}&page=${page}`
          const response = await axios.get(url)
          const articles = response.data.articles
          hasNext = !!response.data.next_page
          
          let j = 1
          for (const article of articles) {
            console.log(`Fetching article ${j} from page ${page}`)
            j++
            const isPub = article.publication
            if (!isPub) {
              console.log('Article is not public')
              hasNext = false;
              break;
            }
            await delay(5000); 
            try {
              const url = `https://zenn.dev/api/articles/${article.slug}`
              const articleDetailsResponse = await axios.get(url);
              const articleDetails = articleDetailsResponse.data.article;
              const topics = articleDetails.topics;
              
              allArticles.push({ ...article, topics })
            } catch (articleError) {
              console.error(`Error fetching details for article ${article.slug}:`, articleError.message);
            }

          }
          if (hasNext) {
            await delay(5000); 
          }
          page++
        } catch (error) {
          console.error('Error fetching articles:', error.message)
          page++;
        }
      }
      const isLast = i === publicationNames.length;
      await appendToFile(filename, name, allArticles, isLast);
      i ++

      
    }
    await writeFinalBracket(filename);
    console.log('Articles have been saved to all_publication_articles.json');

}

async function main() {
  try {
    const publicationNames = await loadPublicationNames();
    await fetchArticles(publicationNames, 'all_publication_articles.json');
  } catch (error) {
    console.error('Failed to fetch articles:', error);
  }
}

main()

