import express from 'express';
import { chromium } from 'playwright';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('public'));

const DEFAULT_URL =
  'https://mashop.kr/jari/%EB%AF%B8%EB%82%98%EB%A5%B4%EC%88%B2%3A%EB%82%A8%EA%B2%A8%EC%A7%84%20%EC%9A%A9%EC%9D%98%20%EB%91%A5%EC%A7%80';

function extractKeywordFromUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    if (!parsed.pathname.startsWith('/jari/')) {
      return null;
    }

    return decodeURIComponent(parsed.pathname.replace('/jari/', ''));
  } catch {
    return null;
  }
}

app.get('/api/prices', async (req, res) => {
  const sourceUrl = req.query.url || DEFAULT_URL;
  const startDate = req.query.startDate;
  const endDate = req.query.endDate;

  if (!startDate || !endDate) {
    return res.status(400).json({ message: 'startDate와 endDate가 필요합니다.' });
  }

  if (startDate > endDate) {
    return res.status(400).json({ message: '시작일은 종료일보다 빠르거나 같아야 합니다.' });
  }

  const keyword = extractKeywordFromUrl(sourceUrl);
  if (!keyword) {
    return res.status(400).json({ message: '올바른 mashop /jari URL을 입력해주세요.' });
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    });

    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });

    const apiUrl = `https://api.mashop.kr/api/v2/maps/price-stat/period?keyword=${encodeURIComponent(
      keyword,
    )}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;

    const responsePayload = await page.evaluate(async (url) => {
      const response = await fetch(url, { credentials: 'include' });
      const text = await response.text();
      return { ok: response.ok, status: response.status, text };
    }, apiUrl);

    if (!responsePayload.ok) {
      return res.status(502).json({
        message: '메랜샵 시간별 평균가 데이터를 가져오지 못했습니다.',
        status: responsePayload.status,
      });
    }

    const rows = JSON.parse(responsePayload.text);
    return res.json({ keyword, sourceUrl, startDate, endDate, rows });
  } catch (error) {
    return res.status(500).json({
      message: '데이터 조회 중 오류가 발생했습니다.',
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
