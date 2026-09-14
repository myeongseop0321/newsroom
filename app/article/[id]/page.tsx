import { ArrowLeft, ArrowUpRight, Clock3 } from "lucide-react";
import { notFound } from "next/navigation";
import { getAppUser, signInPath, signOutPath } from "@/app/auth";
import { getArticle, loadArticleContent } from "@/lib/article-reader";
import { publishers } from "@/lib/publishers";

export const dynamic = "force-dynamic";

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{64}$/.test(id)) notFound();
  const article = await getArticle(id);
  if (!article) notFound();

  const [content, user] = await Promise.all([loadArticleContent(article), getAppUser()]);
  const publisher = publishers.find((item) => item.id === article.publisher);
  const dateValue = content.publishedAt || article.publishedAt || article.collectedAt;
  const parsedDate = dateValue ? new Date(dateValue) : null;
  const formattedDate = parsedDate && !Number.isNaN(parsedDate.getTime())
    ? new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Seoul",
      }).format(parsedDate)
    : null;

  return (
    <div className="site-shell reader-site">
      <header className="masthead">
        <div className="masthead-inner">
          <a href="/" className="brand" aria-label="PRESSROOM 홈">PRESS<span>ROOM</span><i /></a>
          <div className="brand-divider" />
          <span className="brand-caption">뉴스를 한눈에</span>
          <div className="header-right">
            {user ? (
              <>
                <span className="account-name">{user.displayName.split("@")[0]} 님</span>
                <a className="reader-account-link" href={signOutPath("/")}>로그아웃</a>
              </>
            ) : (
              <a className="signin" href={signInPath(`/article/${article.id}`)}>로그인</a>
            )}
          </div>
        </div>
      </header>

      <main className="reader-wrap">
        <a className="reader-back" href="/"><ArrowLeft size={17} /> 뉴스 데스크로</a>
        <article className="reader-article">
          <div className="reader-source" style={{ color: publisher?.color }}>
            {publisher?.name || article.publisher}
            <span>{article.section === "opinion" ? "사설 · 오피니언" : "온라인 1면"}</span>
          </div>
          <h1>{article.title}</h1>
          <div className="reader-meta">
            {content.author && <span>{content.author}</span>}
            {formattedDate && <span><Clock3 size={14} /> {formattedDate}</span>}
          </div>

          {content.image && <img className="reader-image" src={content.image} alt="" referrerPolicy="no-referrer" />}

          {content.available ? (
            <div className="reader-body">
              {content.paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 20)}`}>{paragraph}</p>)}
            </div>
          ) : (
            <div className="reader-unavailable">
              <strong>이 언론사는 본문 가져오기를 허용하지 않았습니다.</strong>
              <p>기사 제목과 출처는 PRESSROOM에서 확인하고, 전체 내용은 원문에서 읽어 주세요.</p>
            </div>
          )}

          <div className="reader-origin">
            <p>기사의 저작권은 해당 언론사에 있습니다.</p>
            <a href={article.url} target="_blank" rel="noopener noreferrer">언론사 원문 보기 <ArrowUpRight size={16} /></a>
          </div>
        </article>
      </main>
    </div>
  );
}
