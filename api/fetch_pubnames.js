import axios from 'axios';
import xml2js from 'xml2js';
import { gunzip } from 'zlib';
import { promisify } from 'util';
import { writeFile } from 'fs/promises';
const gunzipAsync = promisify(gunzip)

async function fetchAndParseGzipXML(url) {
  try {
    // axios で gzip 圧縮されたデータをバイナリ形式で取得
    const response = await axios.get(url, { responseType: 'arraybuffer' })
    const gzippedData = response.data

    // gzip データを解凍
    const xmlData = await gunzipAsync(gzippedData)

    // 解凍した XML データを文字列に変換
    const xmlString = xmlData.toString()

    // xml2js を使用して XML を解析
    const parser = new xml2js.Parser()
    const result = await parser.parseStringPromise(xmlString)
    // 必要なデータ（例: loc 要素の URL）を抽出
    const urls = result.urlset.url.map((u) => u.loc[0])
    return urls
  } catch (error) {
    console.error('Error fetching or parsing the gzip XML:', error)
    throw error
  }
}

async function saveUrlsToJson(urls, filename) {
  try {
    await writeFile(filename, JSON.stringify(urls, null, 2), 'utf8');
    console.log(`URLs have been saved to ${filename}`);
  } catch (error) {
    console.error('Failed to save URLs to JSON:', error);
  }
}

async function main() {
  const publicationUrl = 'https://zenn.dev/sitemaps/publication1.xml.gz';
  try {
    const urls = await fetchAndParseGzipXML(publicationUrl);
    const pubNames = []
    for (const url of urls) {
      const pubName = url.split('/').pop()
      pubNames.push(pubName)
    }
    await saveUrlsToJson(pubNames, 'publication_names.json');
  } catch (error) {
    console.error('Failed to fetch or parse publication URLs:', error);
  }
}

main()

