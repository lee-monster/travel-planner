---
description: "Register new travel spots to TravelKo Notion DB. Takes place names, geocodes addresses, generates descriptions in 4 languages, and creates Notion pages with Published=false."
user_invocable: true
---

# Add Spot Skill

Register new travel spots to the TravelKo Notion database.

## Input

The user provides one or more place names (Korean or English), optionally with category and extra info.

Examples:
- `/add-spot 블루보틀 성수`
- `/add-spot 을지로 노가리골목, 성수 카페 어니언`
- `/add-spot 해운대 블루라인파크 (attraction)`

## Process

For EACH place name provided:

### Step 1: Search & Geocode
1. Use the `/api/geocode` endpoint (WebFetch `https://travel.koinfo.kr/api/geocode?query=<place_name>`) to get coordinates and formatted address
2. If geocoding fails, try searching with WebSearch for the place's Korean address, then geocode that address
3. Verify coordinates are in South Korea (lat 33-39, lng 124-132)

### Step 2: Check Duplicates
1. Fetch existing spots from `https://travel.koinfo.kr/api/travel-spots?lang=en&limit=100` (paginate if needed)
2. Check if a spot with the same or very similar name already exists
3. If duplicate found, STOP and inform the user. Do NOT create a duplicate.

### Step 3: Determine Properties
- **Category**: Infer from place type (restaurant→food, cafe→cafe, park→nature, museum→attraction, mall→shopping, bar→nightlife). Ask user if ambiguous.
- **Region**: Determine from address (서울→Seoul, 부산→Busan, 제주→Jeju, etc.). Use specific sub-regions if they exist in the DB (Seongsu-dong, Haeundae, Hongdae, etc.)
- **Tags**: Select relevant tags from the existing tag list based on the place characteristics

### Step 4: Generate Descriptions
Write a 2-3 sentence description for each language. The description should be helpful for foreign tourists.

- **English (Description)**: Natural, informative description highlighting what makes this place special
- **Korean (Description_ko)**: Korean translation
- **Indonesian (Description_id)**: Indonesian translation
- **Mongolian (Description_mn)**: Mongolian translation

### Step 5: Generate Names
- **Name**: English name (transliterate Korean if needed)
- **Name_ko**: Korean name
- **Name_id**: Same as English (or localized if appropriate)
- **Name_mn**: Same as English (or localized if appropriate)

### Step 6: Create Notion Page
Use the `mcp__claude_ai_Notion__notion-create-pages` tool with:

```
parent: { data_source_id: "2ad2d7ec-5405-4bb8-8a16-ee34ebe88a75" }
properties:
  Name: <English name>
  Name_ko: <Korean name>
  Name_id: <Indonesian name>
  Name_mn: <Mongolian name>
  Description: <English description>
  Description_ko: <Korean description>
  Description_id: <Indonesian description>
  Description_mn: <Mongolian description>
  Category: <category>
  Region: <region>
  Address: <Korean address from geocoding>
  Latitude: <lat as number>
  Longitude: <lng as number>
  Published: "__NO__"
  SubmittedBy: "Claude"
  Tags: <JSON array of tag strings>
```

### Step 7: Report
After creating, report to the user:
- Place name (EN/KO)
- Address
- Coordinates (with link to verify on Google Maps)
- Category / Region
- Status: "등록 완료 (Published=false, 관리자 승인 대기)"

If multiple spots were requested, show a summary table.

## Important Notes
- Always set `Published` to `"__NO__"` — admin approval required
- Always set `SubmittedBy` to `"Claude"`
- Coordinates MUST be verified via geocoding, never guessed
- If geocoding returns no results, ask the user for the address
- Use `GOOGLE_GEOCODING_API_KEY` via the deployed `/api/geocode` endpoint
