export const publishers = [
 { id:'donga', name:'동아일보', short:'東亞', color:'#186447', type:'종합일간지', home:'https://www.donga.com', opinion:'https://www.donga.com/news/Opinion', articlePattern:'/news/.+/article/', rss:'https://rss.donga.com/total.xml' },
 { id:'chosun', name:'조선일보', short:'朝鮮', color:'#122950', type:'종합일간지', home:'https://www.chosun.com', opinion:'https://www.chosun.com/opinion/', articlePattern:'/\\d{4}/\\d{2}/\\d{2}/', rss:'' },
 { id:'hani', name:'한겨레', short:'한겨레', color:'#008e82', type:'종합일간지', home:'https://www.hani.co.kr', opinion:'https://www.hani.co.kr/arti/opinion', articlePattern:'/arti/.+/[0-9]+.html', rss:'https://www.hani.co.kr/rss/' },
 { id:'khan', name:'경향신문', short:'京鄕', color:'#34587a', type:'종합일간지', home:'https://www.khan.co.kr', opinion:'https://www.khan.co.kr/opinion', articlePattern:'/article/[0-9]+', rss:'https://www.khan.co.kr/rss/rssdata/total_news.xml' },
 { id:'seoul', name:'서울신문', short:'서울', color:'#1955a6', type:'종합일간지', home:'https://www.seoul.co.kr', opinion:'https://www.seoul.co.kr/newsList/editOpinion/', articlePattern:'/news/.+/[0-9]+', rss:'https://www.seoul.co.kr/xml/rss/rss.xml' },
 { id:'segye', name:'세계일보', short:'世界', color:'#496c8a', type:'종합일간지', home:'https://www.segye.com', opinion:'https://www.segye.com/news/opinion', articlePattern:'/newsView/[0-9]+', rss:'https://www.segye.com/Articles/RSSList/segye_recent.xml' },
 { id:'hankyung', name:'한국경제', short:'한경', color:'#173d75', type:'경제일간지', home:'https://www.hankyung.com', opinion:'https://www.hankyung.com/opinion', articlePattern:'/article/[0-9]+', rss:'https://www.hankyung.com/feed/all-news' },
 { id:'mk', name:'매일경제', short:'매경', color:'#e66024', type:'경제일간지', home:'https://www.mk.co.kr', opinion:'https://www.mk.co.kr/opinion/', articlePattern:'/news/[^/]+/[0-9]+', rss:'https://www.mk.co.kr/rss/30000001/' },
 { id:'joongang', name:'중앙일보', short:'中央', color:'#f26a24', type:'종합일간지', home:'https://www.joongang.co.kr', opinion:'https://www.joongang.co.kr/opinion', articlePattern:'/article/[0-9]+', rss:'https://rss.joins.com/joins_news_list.xml' },
 { id:'hankook', name:'한국일보', short:'韓國', color:'#1c7c54', type:'종합일간지', home:'https://www.hankookilbo.com', opinion:'https://www.hankookilbo.com/news/opinion', articlePattern:'/news/article/', rss:'' },
 { id:'kmib', name:'국민일보', short:'國民', color:'#253b80', type:'종합일간지', home:'https://www.kmib.co.kr', opinion:'https://www.kmib.co.kr/opinion/index.asp', articlePattern:'/article/view\\.asp\\?arcid=', rss:'https://www.kmib.co.kr/rss/data/kmibPolRss.xml' },
 { id:'yna', name:'연합뉴스', short:'聯合', color:'#1856a5', type:'뉴스통신사', home:'https://www.yna.co.kr', opinion:'https://www.yna.co.kr/opinion/column/index', articlePattern:'/view/[A-Z0-9]+', rss:'https://www.yna.co.kr/rss/news.xml' },
 { id:'munhwa', name:'문화일보', short:'文化', color:'#7a263a', type:'종합일간지', home:'https://www.munhwa.com', opinion:'https://www.munhwa.com/opinion', articlePattern:'/article/[0-9]+', rss:'' },
] as const;
export type Article = {id:string;publisher:string;title:string;url:string;section:'front'|'opinion';publishedAt:string|null;collectedAt:string;image:string|null;saved?:boolean};
export type Topic = {title:string;summary:string;articleIds:string[];publisherCount:number};
export type SourceStatus = {publisher:string;section:string;status:string;count:number;checkedAt:string;message:string|null};
export type TimelinePoint = {id:string;publisher:string;title:string;at:string};
export type TimelineTopic = {title:string;keywords:string[];publisherCount:number;articleCount:number;points:TimelinePoint[]};
export type FollowupState = {days:number;from:string;to:string;topics:TimelineTopic[];publisherCount:number};
export type DeskState = {selected:string[];articles:Article[];scraps:Article[];topics:Topic[];breaking:Article[];statuses:SourceStatus[];analysisMode:string;analysisAt:string|null;aiAvailable:boolean};
