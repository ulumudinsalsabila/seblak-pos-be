export type MasterCategory = {
  code: string;
  id: string;
  name: string;
  sortOrder: number;
};

export type MasterProduct = {
  sku: string;
  name: string;
  category: string;
  price: number;
};

const categoryRows = `
SEBLAK|Seblak
TOPPING_KERUPUK|Topping Kerupuk
TOPPING_MIE|Topping Mie
TOPPING_FROZEN|Topping Frozen
TOPPING_LAINNYA|Sayur, Telur & Topping Kering
NASI_GORENG|Nasi Goreng
MIE_GORENG|Mie Goreng
INDOMIE|Indomie
CILUNG|Cilung
MAKANAN|Makanan
CEMILAN|Cemilan
SMOOTHIES|Smoothies
JUICE|Fresh Juice
MINUMAN|Minuman
`;

export const masterCategories: MasterCategory[] = categoryRows
  .trim()
  .split('\n')
  .map((row, index) => {
    const [code, name] = row.trim().split('|');
    const sequence = String(index + 101).padStart(3, '0');

    return {
      code,
      id: `00000000-0000-4000-8000-000000000${sequence}`,
      name,
      sortOrder: index + 1,
    };
  });

const productRows = `
SBK-001|Seblak Dalung|SEBLAK|10000
SBK-002|Seblak Doer|SEBLAK|15000
SBK-003|Seblak Jeletot|SEBLAK|20000
SBK-004|Seblak Special|SEBLAK|25000
TKR-001|Kerupuk Kerucut|TOPPING_KERUPUK|3000
TKR-002|Kerupuk Jendela|TOPPING_KERUPUK|3000
TKR-003|Kerupuk Kembang Putih|TOPPING_KERUPUK|3000
TKR-004|Kerupuk Delapan|TOPPING_KERUPUK|3000
TKR-005|Kerupuk Kembang Warna|TOPPING_KERUPUK|3000
TKR-006|Kerupuk Bintang|TOPPING_KERUPUK|3000
TKR-007|Makaroni|TOPPING_KERUPUK|3000
TKR-008|Kerupuk Kemplang Orange|TOPPING_KERUPUK|3000
TKR-009|Kerupuk Bawang|TOPPING_KERUPUK|3000
TKR-010|Kerupuk Babangi Warna|TOPPING_KERUPUK|3000
TKR-011|Cibak|TOPPING_KERUPUK|3000
TKR-012|Kerupuk Potato|TOPPING_KERUPUK|3000
TKR-013|Kerupuk Teraje|TOPPING_KERUPUK|3000
TKR-014|Makaroni Delon|TOPPING_KERUPUK|3000
TKR-015|Spiral|TOPPING_KERUPUK|3000
TMI-001|Mie Kuning|TOPPING_MIE|3000
TMI-002|Soun|TOPPING_MIE|4000
TMI-003|Kwitiau|TOPPING_MIE|3000
TMI-004|Mie Instant|TOPPING_MIE|6000
TFR-001|Bakso Ayam|TOPPING_FROZEN|5000
TFR-002|Row Roll|TOPPING_FROZEN|3000
TFR-003|Otak-Otak Singapore|TOPPING_FROZEN|10000
TFR-004|Chikuwa|TOPPING_FROZEN|2000
TFR-005|Odeng|TOPPING_FROZEN|3000
TFR-006|Bakso Sapi/Moza|TOPPING_FROZEN|10000
TFR-007|Sosis Ayam|TOPPING_FROZEN|3000
TFR-008|Dumpling Keju|TOPPING_FROZEN|3000
TFR-009|Dumpling Ayam|TOPPING_FROZEN|3000
TFR-010|Crab Stick|TOPPING_FROZEN|3000
TFR-011|Cumi Flower|TOPPING_FROZEN|2000
TFR-012|Stik Salmon|TOPPING_FROZEN|3000
TFR-013|Lobster Fish Ball|TOPPING_FROZEN|3000
TFR-014|Udang|TOPPING_FROZEN|2000
TFR-015|Twowister|TOPPING_FROZEN|4000
TFR-016|Stik Kepiting|TOPPING_FROZEN|3000
TFR-017|Cirawang|TOPPING_FROZEN|3000
TFR-018|Sosis Ayam Kecil|TOPPING_FROZEN|7000
TFR-019|Sosis Ayam Besar|TOPPING_FROZEN|10000
TFR-020|Baso Aci Keju Moza|TOPPING_FROZEN|10000
TFR-021|Bakso Aci|TOPPING_FROZEN|2000
TFR-022|Ceker Ayam|TOPPING_FROZEN|2000
TFR-023|Otak-Otak Ikan|TOPPING_FROZEN|2000
TFR-024|Tulang Teleng Ayam|TOPPING_FROZEN|2000
TLN-001|Sayur|TOPPING_LAINNYA|2000
TLN-002|Enoki|TOPPING_LAINNYA|5000
TLN-003|Siomay Kering|TOPPING_LAINNYA|3000
TLN-004|Cuanki Lidah|TOPPING_LAINNYA|2000
TLN-005|Pilus|TOPPING_LAINNYA|2000
TLN-006|Telur Puyuh|TOPPING_LAINNYA|2000
TLN-007|Telur Ayam|TOPPING_LAINNYA|3000
TLN-008|Sawi Putih|TOPPING_LAINNYA|2000
NSG-001|Nasi Goreng Dalung|NASI_GORENG|10000
NSG-002|Nasi Goreng Sunja|NASI_GORENG|15000
NSG-003|Nasi Goreng Kambing|NASI_GORENG|25000
MGR-001|Mie Goreng Dalung|MIE_GORENG|10000
MGR-002|Mie Goreng Sunja|MIE_GORENG|15000
MGR-003|Mie Goreng Kambing|MIE_GORENG|25000
MGR-004|Mie Goreng Macak-Macak|MIE_GORENG|20000
MGR-005|Kwitiau Goreng Macak-Macak|MIE_GORENG|20000
IND-001|Indomie Polos|INDOMIE|8000
IND-002|Indomie Telor|INDOMIE|12000
IND-003|Indomie Telor Keju|INDOMIE|18000
IND-004|Indomie Telor Kornet|INDOMIE|18000
IND-005|Indomie Telor Sosis Baso|INDOMIE|18000
IND-006|Indomie Special|INDOMIE|30000
CLG-001|Cilung Tanpa Telor|CILUNG|5000
CLG-002|Cilung Telor Puyuh|CILUNG|6000
CLG-003|Cilung Telor Ayam|CILUNG|8000
MKN-001|Oseng Kambing|MAKANAN|30000
MKN-002|Sop Kambing|MAKANAN|30000
MKN-003|Ayam Kalasan|MAKANAN|15000
MKN-004|Oseng Toge|MAKANAN|15000
MKN-005|Tahu Tempe Goreng|MAKANAN|10000
MKN-006|Nasi Putih|MAKANAN|5000
CML-001|Cimol Bojot Medium|CEMILAN|15000
CML-002|Cimol Bojot Big|CEMILAN|20000
CML-003|Cimin Medium|CEMILAN|15000
CML-004|Cimin Big|CEMILAN|20000
SMT-001|Smoothies Avocado|SMOOTHIES|15000
SMT-002|Smoothies Chocolate|SMOOTHIES|15000
SMT-003|Smoothies Strawberry|SMOOTHIES|15000
SMT-004|Smoothies Mango|SMOOTHIES|15000
SMT-005|Smoothies Nanas|SMOOTHIES|15000
SMT-006|Smoothies Semangka|SMOOTHIES|15000
SMT-007|Smoothies Melon|SMOOTHIES|15000
SMT-008|Smoothies Pisang|SMOOTHIES|15000
SMT-009|Smoothies Naga|SMOOTHIES|15000
JUS-001|Juice Avocado|JUICE|15000
JUS-002|Juice Mango|JUICE|15000
JUS-003|Juice Strawberry|JUICE|15000
JUS-004|Juice Pisang|JUICE|12000
JUS-005|Juice Semangka|JUICE|12000
JUS-006|Juice Nanas|JUICE|12000
JUS-007|Juice Melon|JUICE|10000
JUS-008|Juice Chocolate|JUICE|10000
JUS-009|Juice Naga|JUICE|10000
MNM-001|Teh Tawar|MINUMAN|4000
MNM-002|Teh Manis|MINUMAN|5000
MNM-003|Jeruk Manis|MINUMAN|7000
MNM-004|Jeruk Nipis|MINUMAN|7000
MNM-005|Es Melon Selasih|MINUMAN|10000
MNM-006|Es Ti Pink Lady|MINUMAN|7000
MNM-007|Pop Ice|MINUMAN|7000
MNM-008|Nutrisari|MINUMAN|6000
MNM-009|Josu|MINUMAN|7000
MNM-010|Kopi Bali|MINUMAN|10000
MNM-011|Jus Melon|MINUMAN|10000
MNM-012|Jus Buah Naga|MINUMAN|10000
`;

export const masterProducts: MasterProduct[] = productRows
  .trim()
  .split('\n')
  .map((row) => {
    const [sku, name, category, price] = row.trim().split('|');

    return { sku, name, category, price: Number(price) };
  });
