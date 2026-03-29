#!/usr/bin/env node
// Batch update Malay (ms) and Vietnamese (vi) translations for 20 spots
// Usage: node scripts/update-ms-vi.js <admin-key>

const ENDPOINT = 'https://travel.koinfo.kr/api/admin/cleanup';

const updates = [
  {
    id: '321722c5-4b88-8159-8e1a-fce964b8e0ea',
    properties: {
      Name_ms: 'Ollae Guksu',
      Name_vi: 'Ollae Guksu',
      Description_ms: 'Restoran mi tradisional Jeju di Seogwipo yang menyajikan mi kuah tulang babi (gogi-guksu) kegemaran penduduk tempatan. Hidangan ini terkenal dengan kuah yang pekat dan kaya rasa. Tempat yang wajib dikunjungi untuk merasai cita rasa asli Jeju.',
      Description_vi: 'Nhà hàng mì truyền thống Jeju ở Seogwipo phục vụ món mì nước dùng xương heo (gogi-guksu) được người dân địa phương yêu thích. Món ăn nổi tiếng với nước dùng đậm đà và thơm ngon. Đây là điểm đến không thể bỏ qua để thưởng thức hương vị chính gốc Jeju.',
    },
  },
  {
    id: '321722c5-4b88-81e5-8ddf-d5cccd5e6acd',
    properties: {
      Name_ms: 'Myeongjin Jeonbok',
      Name_vi: 'Myeongjin Jeonbok',
      Description_ms: 'Restoran bubur abalone terkenal di Jeju berhampiran Pasar Dongmun. Abalone segar dituai oleh penyelam haenyeo yang mahir. Bubur yang lembut dan kaya rasa laut menjadikannya hidangan sarapan yang sempurna.',
      Description_vi: 'Nhà hàng cháo bào ngư nổi tiếng ở Jeju gần Chợ Dongmun. Bào ngư tươi được thu hoạch bởi các nữ thợ lặn haenyeo. Cháo mềm mịn với hương vị biển đậm đà, là lựa chọn hoàn hảo cho bữa sáng.',
    },
  },
  {
    id: '321722c5-4b88-8127-b5d4-e6e6f8efd2e2',
    properties: {
      Name_ms: 'Haejigae Cafe',
      Name_vi: 'Haejigae Cafe',
      Description_ms: 'Kafe yang terletak di tebing dramatik di Jeju dengan tingkap kaca dari lantai ke siling menghadap lautan. Pemandangan laut yang menakjubkan menjadikannya tempat yang sempurna untuk bersantai. Suasana yang indah sesuai untuk menikmati kopi sambil memandang ombak.',
      Description_vi: 'Quán cà phê nằm trên vách đá ấn tượng ở Jeju với cửa kính từ sàn đến trần nhìn ra đại dương. Tầm nhìn biển tuyệt đẹp tạo nên không gian thư giãn hoàn hảo. Đây là nơi lý tưởng để thưởng thức cà phê và ngắm sóng biển.',
    },
  },
  {
    id: '321722c5-4b88-81aa-9b36-f9a8e6e2e113',
    properties: {
      Name_ms: 'Tosokchon Samgyetang',
      Name_vi: 'Tosokchon Samgyetang',
      Description_ms: 'Restoran sup ayam ginseng (samgyetang) yang legendaris berhampiran Istana Gyeongbokgung. Beroperasi sejak tahun 1983, restoran ini terkenal dengan sup ayam yang diisi ginseng, beras glutin dan jujube. Destinasi wajib bagi pencinta makanan tradisional Korea.',
      Description_vi: 'Nhà hàng gà hầm sâm (samgyetang) huyền thoại gần Cung điện Gyeongbokgung. Hoạt động từ năm 1983, nhà hàng nổi tiếng với món gà hầm nhân sâm, gạo nếp và táo tàu. Đây là điểm đến không thể bỏ qua cho những ai yêu ẩm thực truyền thống Hàn Quốc.',
    },
  },
  {
    id: '321722c5-4b88-8193-bcbc-f5b64d2daadb',
    properties: {
      Name_ms: 'Jangsu Jokbal',
      Name_vi: 'Jangsu Jokbal',
      Description_ms: 'Restoran kaki babi rebus (jokbal) paling terkenal di Seoul, terletak di Jangchung-dong. Beroperasi sejak tahun 1981, hidangan kaki babi yang lembut dan beraroma menjadi kegemaran ramai. Tempat yang sempurna untuk merasai hidangan klasik Korea.',
      Description_vi: 'Nhà hàng chân giò hầm (jokbal) nổi tiếng nhất Seoul, tọa lạc tại Jangchung-dong. Hoạt động từ năm 1981, món chân giò mềm thơm là niềm tự hào của quán. Đây là nơi tuyệt vời để thưởng thức món ăn kinh điển của ẩm thực Hàn Quốc.',
    },
  },
  {
    id: '321722c5-4b88-81b5-8e7f-db31335ed4d7',
    properties: {
      Name_ms: 'Neutral Colors',
      Name_vi: 'Neutral Colors',
      Description_ms: 'Kafe reka bentuk minimalis di Seongsu-dong dengan estetika monokrom yang menarik. Ruang dalaman yang bersih dan moden menjadikannya tempat yang popular untuk bergambar. Sesuai untuk pencinta seni dan reka bentuk yang ingin bersantai.',
      Description_vi: 'Quán cà phê thiết kế tối giản ở Seongsu-dong với phong cách đơn sắc ấn tượng. Không gian nội thất sạch sẽ và hiện đại khiến nơi đây trở thành điểm chụp ảnh yêu thích. Phù hợp cho những ai yêu nghệ thuật và thiết kế muốn thư giãn.',
    },
  },
  {
    id: '321722c5-4b88-81d2-864b-e6ba2b44ab85',
    properties: {
      Name_ms: 'Coffee Hanyakbang',
      Name_vi: 'Coffee Hanyakbang',
      Description_ms: 'Kedai ubat tradisional Korea yang diubah menjadi kafe unik di Ikseon-dong. Suasana klasik dengan sentuhan moden mencipta pengalaman minum kopi yang istimewa. Tempat yang sempurna untuk merasai gabungan budaya tradisional dan kontemporari.',
      Description_vi: 'Tiệm thuốc Đông y truyền thống Hàn Quốc được cải tạo thành quán cà phê độc đáo ở Ikseon-dong. Không gian cổ điển pha trộn hiện đại tạo nên trải nghiệm uống cà phê đặc biệt. Nơi hoàn hảo để cảm nhận sự giao thoa giữa văn hóa truyền thống và đương đại.',
    },
  },
  {
    id: '321722c5-4b88-81bc-b1b2-c06339eb5168',
    properties: {
      Name_ms: 'Yukjeon Sikdang',
      Name_vi: 'Yukjeon Sikdang',
      Description_ms: 'Salah satu restoran BBQ Korea tertua di Seoul, terkenal dengan potongan daging brisket tangan yang lembut (yukhoe). Suasana tradisional dan rasa daging yang autentik menjadikannya destinasi makanan yang wajib dikunjungi. Pengalaman BBQ Korea yang tiada tandingan.',
      Description_vi: 'Một trong những nhà hàng BBQ Hàn Quốc lâu đời nhất Seoul, nổi tiếng với thịt ức bò thái tay mềm mại (yukhoe). Không gian truyền thống và hương vị thịt đích thực khiến nơi đây trở thành điểm ẩm thực không thể bỏ qua. Trải nghiệm BBQ Hàn Quốc đẳng cấp.',
    },
  },
  {
    id: '321722c5-4b88-81e5-bff8-c1f1fc56fe07',
    properties: {
      Name_ms: 'Seongsu Handmade Burger',
      Name_vi: 'Seongsu Handmade Burger',
      Description_ms: 'Kedai burger artisan di Seongsu-dong yang menggunakan daging lembu Korea premium. Burger dibuat dengan teliti menggunakan bahan-bahan segar berkualiti tinggi. Pengalaman burger gourmet yang autentik di tengah kawasan kreatif Seoul.',
      Description_vi: 'Quán burger thủ công ở Seongsu-dong sử dụng thịt bò Hàn Quốc cao cấp. Burger được chế biến tỉ mỉ từ nguyên liệu tươi chất lượng cao. Trải nghiệm burger gourmet đích thực giữa khu phố sáng tạo của Seoul.',
    },
  },
  {
    id: '321722c5-4b88-81e9-b5cc-de61fcb2e2c5',
    properties: {
      Name_ms: 'Mesh Coffee',
      Name_vi: 'Mesh Coffee',
      Description_ms: 'Kedai kopi istimewa di Seongsu yang terkenal dengan reka bentuk bergaya industri-chic dan biji kopi pilihan yang teliti. Suasana yang unik dan kopi berkualiti tinggi menarik ramai pencinta kopi. Tempat yang ideal untuk menikmati secawan kopi yang sempurna.',
      Description_vi: 'Quán cà phê đặc sản ở Seongsu nổi tiếng với thiết kế phong cách công nghiệp và hạt cà phê được tuyển chọn kỹ lưỡng. Không gian độc đáo và cà phê chất lượng cao thu hút nhiều tín đồ cà phê. Nơi lý tưởng để thưởng thức một tách cà phê hoàn hảo.',
    },
  },
  {
    id: '321722c5-4b88-814d-9b41-d6baec1b6236',
    properties: {
      Name_ms: 'Seomyeon Shopping District',
      Name_vi: 'Khu Mua Sắm Seomyeon',
      Description_ms: 'Kawasan komersial utama Busan dengan pusat membeli-belah bawah tanah, lorong makanan jalanan dan kehidupan malam yang meriah. Destinasi membeli-belah yang lengkap dengan pelbagai jenama dan butik. Tempat yang sempurna untuk membeli-belah, makan dan berhibur.',
      Description_vi: 'Khu thương mại chính của Busan với trung tâm mua sắm ngầm, các con hẻm ẩm thực đường phố và cuộc sống về đêm sôi động. Điểm mua sắm toàn diện với đa dạng thương hiệu và cửa hàng. Nơi hoàn hảo để mua sắm, ăn uống và giải trí.',
    },
  },
  {
    id: '321722c5-4b88-8199-bcbb-e2db9b21e1c1',
    properties: {
      Name_ms: 'Jukseong Dream Church',
      Name_vi: 'Jukseong Dream Church',
      Description_ms: 'Gereja terbiar di pantai yang terkenal melalui drama dan filem Korea. Lokasi foto viral di Gijang dengan latar belakang laut yang dramatik. Suasana romantis dan misteri menjadikannya destinasi popular di kalangan pengunjung.',
      Description_vi: 'Nhà thờ hoang trên bãi biển từng xuất hiện trong các bộ phim và drama Hàn Quốc. Địa điểm chụp ảnh viral ở Gijang với phông nền biển ấn tượng. Không khí lãng mạn và huyền bí khiến nơi đây trở thành điểm đến phổ biến của du khách.',
    },
  },
  {
    id: '321722c5-4b88-8188-ae4d-eafea89e3e34',
    properties: {
      Name_ms: 'Huinnyeoul Culture Village',
      Name_vi: 'Làng Văn Hóa Huinnyeoul',
      Description_ms: 'Kampung tebing yang indah di Yeongdo dengan rumah-rumah bercat putih menghadap lautan. Lorong-lorong sempit yang menawan dan pemandangan laut yang menakjubkan mencipta suasana yang unik. Tempat yang sempurna untuk berjalan santai dan menikmati seni jalanan.',
      Description_vi: 'Ngôi làng trên vách đá tuyệt đẹp ở Yeongdo với những ngôi nhà sơn trắng nhìn ra biển. Những con hẻm nhỏ quyến rũ và tầm nhìn biển tuyệt vời tạo nên không gian độc đáo. Nơi hoàn hảo để dạo bộ thong thả và thưởng thức nghệ thuật đường phố.',
    },
  },
  {
    id: '321722c5-4b88-815e-bfff-c76a8305aa72',
    properties: {
      Name_ms: 'Seongsu Street Art & Mural Alley',
      Name_vi: 'Hẻm Nghệ Thuật Đường Phố Seongsu',
      Description_ms: 'Galeri luar yang penuh warna dengan seni jalanan dan mural di kawasan kreatif Seongsu-dong. Karya seni yang menarik dan unik menghiasi dinding-dinding lorong. Tempat yang ideal untuk bergambar dan menghargai seni kontemporari.',
      Description_vi: 'Phòng trưng bày ngoài trời đầy màu sắc với nghệ thuật đường phố và tranh tường ở khu phố sáng tạo Seongsu-dong. Những tác phẩm nghệ thuật hấp dẫn và độc đáo trang trí các bức tường hẻm. Nơi lý tưởng để chụp ảnh và thưởng thức nghệ thuật đương đại.',
    },
  },
  {
    id: '321722c5-4b88-8135-ad63-d96530e5b05e',
    properties: {
      Name_ms: 'Galmegi Brewing Gwangalli',
      Name_vi: 'Galmegi Brewing Gwangalli',
      Description_ms: 'Perintis bir kraf Busan dengan ruang tap yang menghadap lautan di Pantai Gwangalli. Pelbagai pilihan bir kraf tempatan yang segar dan unik. Nikmati bir sambil memandang pemandangan laut dan jambatan yang menakjubkan.',
      Description_vi: 'Tiên phong bia thủ công Busan với phòng nếm bia nhìn ra biển tại Bãi biển Gwangalli. Đa dạng lựa chọn bia thủ công địa phương tươi mới và độc đáo. Thưởng thức bia trong khi ngắm nhìn cảnh biển và cầu tuyệt đẹp.',
    },
  },
  {
    id: '321722c5-4b88-81ad-aafc-c5b1d2bbc1f6',
    properties: {
      Name_ms: 'Sobok Chicken',
      Name_vi: 'Sobok Chicken',
      Description_ms: 'Rangkaian ayam goreng Korea yang popular, terkenal dengan ayam yang berair dan rangup pada harga yang berpatutan. Pelbagai perisa dan sos yang lazat menjadikannya pilihan kegemaran ramai. Tempat yang sesuai untuk menikmati ayam goreng Korea yang autentik.',
      Description_vi: 'Chuỗi gà rán Hàn Quốc phổ biến, nổi tiếng với gà mọng nước, giòn rụm với giá cả phải chăng. Đa dạng hương vị và sốt ngon khiến đây trở thành lựa chọn yêu thích của nhiều người. Nơi phù hợp để thưởng thức gà rán Hàn Quốc đích thực.',
    },
  },
  {
    id: '321722c5-4b88-8198-ac1b-d6d1b69e4c39',
    properties: {
      Name_ms: 'Tteuran',
      Name_vi: 'Tteuran',
      Description_ms: 'Kafe taman yang cantik di kawasan hanok tradisional Bukchon. Terkenal dengan pemandangan taman yang berubah mengikut musim. Suasana yang tenang dan indah menjadikannya tempat yang sempurna untuk bersantai dan menikmati minuman.',
      Description_vi: 'Quán cà phê vườn xinh đẹp trong khu hanok truyền thống Bukchon. Nổi tiếng với cảnh vườn thay đổi theo mùa. Không gian yên tĩnh và tuyệt đẹp khiến đây trở thành nơi hoàn hảo để thư giãn và thưởng thức đồ uống.',
    },
  },
  {
    id: '321722c5-4b88-8121-932a-fb2c3f98e1cd',
    properties: {
      Name_ms: 'Daelim Changgo',
      Name_vi: 'Daelim Changgo',
      Description_ms: 'Gudang yang diubah suai menjadi ruang kreatif dan kafe di Seongsu-dong. Seni bina industri yang dipulihara dengan indah mencipta suasana yang unik. Tempat yang popular untuk pameran seni, acara budaya dan menikmati kopi.',
      Description_vi: 'Nhà kho được cải tạo thành không gian sáng tạo và quán cà phê ở Seongsu-dong. Kiến trúc công nghiệp được phục hồi đẹp mắt tạo nên không gian độc đáo. Địa điểm phổ biến cho triển lãm nghệ thuật, sự kiện văn hóa và thưởng thức cà phê.',
    },
  },
  {
    id: '321722c5-4b88-810f-a5e1-d8e07da3bab9',
    properties: {
      Name_ms: 'Thursday Party Gwangalli',
      Name_vi: 'Thursday Party Gwangalli',
      Description_ms: 'Bar dan restoran bumbung yang bergaya di Pantai Gwangalli dengan pemandangan Jambatan Gwangan yang menakjubkan. Suasana mewah dan santai dengan muzik yang meriah. Tempat yang ideal untuk menikmati makan malam dan minuman sambil memandang laut.',
      Description_vi: 'Quán bar và nhà hàng sân thượng thời thượng tại Bãi biển Gwangalli với tầm nhìn tuyệt đẹp ra Cầu Gwangan. Không gian sang trọng và thư giãn với âm nhạc sôi động. Nơi lý tưởng để thưởng thức bữa tối và đồ uống ngắm biển.',
    },
  },
  {
    id: '321722c5-4b88-810a-a8f3-cf9336a0c1c9',
    properties: {
      Name_ms: 'Shinsegae Centum City',
      Name_vi: 'Shinsegae Centum City',
      Description_ms: 'Pusat membeli-belah terbesar di dunia mengikut Guinness World Records, terletak di Centum City, Busan. Menawarkan pelbagai jenama mewah, restoran dan kemudahan hiburan. Pengalaman membeli-belah yang tiada tandingan di Korea Selatan.',
      Description_vi: 'Trung tâm thương mại lớn nhất thế giới theo Kỷ lục Guinness, tọa lạc tại Centum City, Busan. Cung cấp đa dạng thương hiệu cao cấp, nhà hàng và tiện ích giải trí. Trải nghiệm mua sắm không gì sánh được tại Hàn Quốc.',
    },
  },
];

async function main() {
  const adminKey = process.argv[2];
  if (!adminKey) {
    console.error('Usage: node scripts/update-ms-vi.js <admin-key>');
    process.exit(1);
  }

  // Process in batches of 6
  const batchSize = 6;
  let totalOk = 0;
  let totalErr = 0;

  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(updates.length / batchSize)} (${batch.length} spots)...`);

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': adminKey,
      },
      body: JSON.stringify({
        action: 'update_translations',
        updates: batch,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error(`Batch error:`, data);
      continue;
    }

    console.log(`  OK: ${data.ok}, Errors: ${data.errors}`);
    if (data.errors > 0) {
      data.results.filter(r => r.status === 'error').forEach(r => {
        console.error(`  Error for ${r.id}: ${r.message}`);
      });
    }
    totalOk += data.ok || 0;
    totalErr += data.errors || 0;
  }

  console.log(`\nDone! Total OK: ${totalOk}, Total Errors: ${totalErr}`);
}

main().catch(console.error);
