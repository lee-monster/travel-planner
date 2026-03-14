# TravelKo Project Guidelines

## Project Overview
TravelKo(travel.koinfo.kr)는 한국 여행 가이드 서비스입니다.
외국인 대상 커뮤니티 기반 여행 스팟 추천 + AI 여행 플래너를 제공합니다.
KoInfo(koinfo.kr) 모노레포에서 2026-03-14 분리된 독립 프로젝트입니다.

## Architecture
- **SPA**: 단일 index.html + travel-app.js로 구성
- **6개 언어**: en, ko, id (인도네시아어), mn (몽골어), ms (말레이어), vi (베트남어)
- **Vercel Serverless**: API 엔드포인트 (Notion DB 연동)
- **이중 지도**: Naver Maps + Google Maps (fallback)

## Tech Stack
- Vanilla HTML/CSS/JS (no framework)
- Vercel 배포 (GitHub: lee-monster/travel-planner)
- Notion API 연동 (스팟 DB, 사용자 DB)
- Google OAuth + JWT 인증
- Gemini 2.0 Flash AI 플래너 (Google Search Grounding)
- Naver Maps / Google Maps API

## File Structure
```
├── index.html              (SPA 진입점)
├── css/travel-app.css      (스타일)
├── js/travel-app.js        (메인 앱 로직)
├── sites/travel/lang.js    (6개국어 번역)
├── api/
│   ├── travel-spots.js     (스팟 목록 조회 - Notion)
│   ├── travel-submit.js    (스팟 제출 - Notion)
│   ├── travel-planner.js   (AI 플래너 - Gemini)
│   ├── map-config.js       (지도 API 키 제공)
│   ├── sitemap.js          (동적 sitemap)
│   ├── _lib/auth.js        (JWT/Google 토큰 유틸)
│   ├── auth/google.js      (Google OAuth 엔드포인트)
│   └── user/bookmarks.js   (북마크 CRUD)
├── images/og-travel.png    (OG 이미지)
├── favicon.svg
├── robots.txt
├── vercel.json
└── package.json            (의존성: @notionhq/client)
```

## Vercel 환경변수
- NOTION_TOKEN_TRAVEL: Notion API 토큰
- NOTION_DB_TRAVEL: 스팟 DB ID (`953d3d1ce2d548ac8104b17c1c3510c4`)
- NOTION_DB_USERS: 사용자 DB ID
- NAVER_MAPS_CLIENT_ID: 네이버 지도 Client ID
- NAVER_MAPS_CLIENT_KEY: 네이버 지도 Client Secret
- GOOGLE_MAPS_API_KEY: 구글 지도 API 키
- GOOGLE_CLIENT_ID: Google OAuth 클라이언트 ID
- JWT_SECRET: JWT 서명 시크릿
- GEMINI_API_KEY: Gemini AI 플래너 API 키

## Notion DB (Spots)
- Published 체크박스로 게시 승인 관리
- 4개국어 필드: Name/Description + _ko/_id/_mn
- 위경도(Latitude/Longitude), Category, Region, Tags
- 사용자 제출 시 Published=false로 생성 → 관리자 승인 후 노출

## Naver Maps API (중요)
- NCP 지도 SDK 로드 파라미터: **`ncpKeyId`** (ncpClientId 아님!)
- URL: `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId={clientId}&submodules=geocoder`

## Auth/Bookmark/Planner
- Google OAuth → JWT 기반 인증 (30일 만료)
- 북마크: want_to_visit / interested 2가지 타입
- Notion Users DB에 JSON으로 북마크 저장
- AI 플래너: Gemini 2.0 Flash + Google Search Grounding
- 사용자의 "방문할 곳" 스팟 기반 일정 생성

## 콘텐츠 현황
- 전국 87개+ 스팟 등록 완료
- 부산, 서울, 제주, 강릉/속초, 전주, 경주, 여수, 대구, 인천, 수원
- 모든 스팟 4개국어(EN/KO/ID/MN) 번역 포함

## SEO
- OG, Twitter Card, canonical, hreflang 메타 태그
- JSON-LD 구조화 데이터 (WebSite, TravelAgency, BreadcrumbList)
- 동적 sitemap (카테고리/지역별 URL 포함)
- GEO 태그 (Korea 중심)

## Pending
- AI 플래너 동작 재확인 필요 (이전에 불안정했음)
- 플래너 spots 리스트 왼쪽 정렬 수정 확인 필요
- Google Search Console 등록

## Workflow: Session Start Protocol
새 작업 시작 전, 반드시 아래 순서로 현재 상태를 파악한다:
1. `git status` — 커밋되지 않은 변경사항/untracked 파일 확인
2. `git diff` — 진행 중이던 수정 내용 파악
3. `git log --oneline -5` — 최근 커밋 히스토리 확인
4. 위 결과를 사용자에게 요약 보고 후, 새 작업 진행

## Language
- 사용자와의 소통: 한국어
- 코드 주석: 영어
- 커밋 메시지: 영어
