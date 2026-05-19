import Parser from 'rss-parser';

const parser = new Parser();

export interface RSSNewsItem {
    title: string;
    link: string;
    pubDate: string | null;
}

function decodeGoogleNewsUrl(url: string): string {
    try {
        const decoded = decodeURIComponent(url);

        const match = decoded.match(/https?:\/\/[^&]+/);

        return match?.[0] || url;
    } catch {
        return url;
    }
}

export async function fetchGoogleRSS(
    query: string
): Promise<RSSNewsItem[]> {

    const encoded = encodeURIComponent(query);
    
    const rssUrl =
        `https://news.google.com/rss/search?q=${encoded}&hl=en-IN&gl=IN&ceid=IN:en`;

    const feed = await parser.parseURL(rssUrl);

    return (feed.items || []).map((item) => ({
        title: item.title || '',
        link: decodeGoogleNewsUrl(item.link || ''),
        pubDate: item.pubDate || null,
    }));
}