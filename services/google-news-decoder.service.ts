import axios from 'axios';
import * as cheerio from 'cheerio';

export async function resolveGoogleNewsUrl(
  googleRssUrl: string
): Promise<string> {

  try {
    // Already normal URL
    if (!googleRssUrl.includes('news.google.com')) {
      return googleRssUrl;
    }

    // STEP 1: Load RSS redirect page
    const response = await axios.get(googleRssUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/132.0.0.0 Safari/537.36',
      },
    });

    const $ = cheerio.load(response.data);

    // STEP 2: Extract Google internal payload
    const data = $('c-wiz[data-p]').attr('data-p');

    if (!data) {
      console.log('[google-resolve] no data-p found');
      return googleRssUrl;
    }

    // STEP 3: Convert payload
    const obj = JSON.parse(
      data.replace('%.@.', '["garturlreq",')
    );

    // STEP 4: Build batchexecute payload
    const payload = {
      'f.req': JSON.stringify([
        [
          [
            'Fbv4je',
            JSON.stringify([
              ...obj.slice(0, -6),
              ...obj.slice(-2),
            ]),
            null,
            'generic',
          ],
        ],
      ]),
    };

    // STEP 5: Request actual article URL
    const postResponse = await axios.post(
      'https://news.google.com/_/DotsSplashUi/data/batchexecute',
      payload,
      {
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/132.0.0.0 Safari/537.36',
        },
      }
    );

    // STEP 6: Parse Google response
    const cleaned = postResponse.data.replace(")]}'", '');

    const arrayString = JSON.parse(cleaned)[0][2];

    const articleUrl = JSON.parse(arrayString)[1];

    console.log('[google-resolve] resolved:', articleUrl);
    return articleUrl || googleRssUrl;

  } catch (err) {
    console.error('[google-resolve]', err);
    return googleRssUrl;
  }
}