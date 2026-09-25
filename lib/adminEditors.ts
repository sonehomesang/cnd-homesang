import type { FieldGroup } from '@/components/admin/GroupedRecordEditor';
import { CATEGORIES } from './categories';

// Per-collection grouped-editor configs. Add more collections over time so
// every admin panel's ✎ opens a meaning-grouped editor (see the editor pattern
// memory). The ⚙️ advanced tab always catches any field not listed here.

const CAT_OPTS = CATEGORIES.map((c) => ({ value: c.value, label: `${c.icon ?? ''} ${c.lao}`.trim() }));

export const JOB_GROUPS: FieldGroup[] = [
  {
    key: 'post',
    label: '📣 ປະກາດວຽກ',
    fields: [
      { key: 'title', label: 'ຫົວຂໍ້ ປະກາດວຽກ', kind: 'text' },
      // location right under the title (auto-detect available)
      { key: 'address', label: '🏠 ທີ່ຢູ່ / ສະຖານທີ່', kind: 'text' },
      { key: 'lat', label: 'ພິກັດ', kind: 'latlng' },
      { key: 'category', label: 'ໝວດ ງານ', kind: 'select', options: CAT_OPTS },
      { key: 'description', label: 'ລາຍລະອຽດ', kind: 'textarea' },
      [
        { key: 'budget', label: '💰 ງົບປະມານ (ກີບ)', kind: 'money' },
        { key: 'finalPrice', label: 'ລາຄາ ສຸດທ້າຍ (ກີບ)', kind: 'money' },
      ],
      { key: 'photos', label: '🖼️ ຮູບປະກອບ', kind: 'images' },
      // status as the last row, after photos
      { key: 'status', label: 'ສະຖານະ ປະກາດ', kind: 'select', options: [
        { value: 'open', label: 'ເປີດຮັບ' },
        { value: 'assigned', label: 'ມີຊ່າງ' },
        { value: 'in_progress', label: 'ກຳລັງເຮັດ' },
        { value: 'completed', label: 'ສຳເລັດ' },
        { value: 'cancelled', label: 'ຍົກເລີກ' },
        { value: 'pending_payment', label: 'ລໍຖ້າຈ່າຍ' },
      ] },
    ],
  },
];

const ORDER_STATUS_OPTS = [
  { value: 'pending', label: 'ຮໍ' },
  { value: 'confirmed', label: 'ຢືນຢັນ' },
  { value: 'delivering', label: 'ກຳລັງສົ່ງ' },
  { value: 'delivered', label: 'ສົ່ງແລ້ວ' },
  { value: 'completed', label: 'ສຳເລັດ' },
  { value: 'cancelled', label: 'ຍົກເລີກ' },
];

export const ORDER_GROUPS: FieldGroup[] = [
  {
    key: 'order',
    label: '📦 ການສັ່ງຊື້',
    fields: [
      { key: 'orderNumber', label: 'ເລກທີ່ ອໍເດີ', kind: 'text' },
      { key: 'customerId', label: '👤 ຜູ້ສັ່ງຊື້ (ລະບຸ)', kind: 'select', source: 'users' },
      { key: 'shopId', label: '🏬 ຮ້ານຄ້າ', kind: 'select', source: 'shops' },
      { key: 'status', label: 'ສະຖານະ', kind: 'select', options: ORDER_STATUS_OPTS },
      [
        { key: 'paymentMethod', label: 'ການຈ່າຍເງິນ', kind: 'select', options: [{ value: 'bank_transfer', label: '🏦 ໂອນ' }, { value: 'cod', label: '💵 ປາຍທາງ' }] },
        { key: 'deliveryMethod', label: 'ການຮັບເຄື່ອງ', kind: 'select', options: [{ value: 'delivery', label: '🚚 ສົ່ງ' }, { value: 'pickup', label: '🏬 ມາຮັບ' }] },
      ],
      { key: 'deliveryAddress', label: '🏠 ທີ່ຢູ່ ສົ່ງ', kind: 'text' },
    ],
  },
  {
    key: 'amount',
    label: '💰 ຈຳນວນເງິນ',
    fields: [
      [
        { key: 'subtotal', label: 'ລວມຍ່ອຍ (ກີບ)', kind: 'money' },
        { key: 'deliveryFee', label: 'ຄ່າສົ່ງ (ກີບ)', kind: 'money' },
      ],
      [
        { key: 'vat', label: 'VAT (ກີບ)', kind: 'money' },
        { key: 'vatRate', label: 'VAT %', kind: 'number' },
      ],
      { key: 'grandTotal', label: 'ລວມທັງໝົດ (ກີບ)', kind: 'money' },
      { key: 'paymentVerified', label: '✅ ຢືນຢັນ ການຈ່າຍ ແລ້ວ', kind: 'bool' },
    ],
  },
];

export const SHOP_GROUPS: FieldGroup[] = [
  {
    key: 'shop',
    label: '🏬 ຂໍ້ມູນຮ້ານ',
    fields: [
      { key: 'image', label: '🏬 ໂລໂກ້ / ຮູບຮ້ານ', kind: 'avatar' },
      { key: 'name', label: 'ຊື່ຮ້ານ', kind: 'text' },
      // owner = a real user account in the ບໍລິສັດ-ຮ້ານຄ້າ (corporation) group.
      { key: 'ownerId', label: '👑 ເຈົ້າຂອງ ຮ້ານ (ຈາກ ກຸ່ມ ບໍລິສັດ-ຮ້ານຄ້າ)', kind: 'select', source: 'users', usersGroup: 'corporation' },
      { key: 'address', label: '🏠 ທີ່ຢູ່', kind: 'text' },
      { key: 'lat', label: 'ພິກັດ', kind: 'latlng' },
      [
        { key: 'contactName', label: '👤 ຜູ້ຕິດຕໍ່', kind: 'text' },
        { key: 'contactPosition', label: 'ຕຳແໜ່ງ', kind: 'text' },
      ],
      { key: 'phone', label: '📱 ເບີໂທ', kind: 'text' },
      { key: 'description', label: 'ລາຍລະອຽດ', kind: 'textarea' },
      [
        { key: 'isOpen', label: 'ເປີດໃຫ້ບໍລິການ', kind: 'bool' },
        { key: 'isPartner', label: '🤝 Partner', kind: 'bool' },
      ],
    ],
  },
  {
    key: 'deal',
    label: '📦 ສິນຄ້າ & ການສົ່ງ',
    fields: [
      { key: 'productCategories', label: '🗂️ ໝວດສິນຄ້າ ທີ່ຂາຍ (ເລືອກໄດ້ຫຼາຍ)', kind: 'multiselect', source: 'productCategories' },
      { key: 'commissionRules', label: '💰 ອັດຕາ ຜົນຕອບແທນ (ໝວດ × ປະເພດລູກຄ້າ × %)', kind: 'commissionRules' },
      [
        { key: 'deliveryPickup', label: '🏪 ມາຮັບເອງ', kind: 'bool' },
        { key: 'deliveryShip', label: '🚚 ໃຫ້ຈັດສົ່ງ', kind: 'bool' },
      ],
      { key: 'deliveryCarriers', label: '🛵 ຜູ້ຈັດສົ່ງ (ເລືອກໄດ້ຫຼາຍ)', kind: 'multiselect', options: [
        { value: 'self', label: '🏪 ຮ້ານສົ່ງເອງ' },
        { value: 'external', label: '🚚 ຂົນສົ່ງ ພາຍນອກ' },
      ] },
      { key: 'deliveryRates', label: '📏 ຄ່າສົ່ງ ຕາມໄລຍະທາງ (km × ກີບ)', kind: 'distanceRates' },
    ],
  },
];

export const PRODUCT_GROUPS: FieldGroup[] = [
  {
    key: 'info',
    label: '🛍️ ສິນຄ້າ',
    fields: [
      { key: 'name', label: 'ຊື່ສິນຄ້າ', kind: 'text' },
      { key: 'shopId', label: '🏬 ຮ້ານຄ້າ (ລະບຸ ກ່ອນ)', kind: 'select', source: 'shops' },
      { key: 'category', label: '🗂️ ໝວດສິນຄ້າ ຫຼັກ', kind: 'productCategory' },
      { key: 'subCategory', label: 'ໝວດຍ່ອຍ', kind: 'productSubCategory' },
      { key: 'descriptionHtml', label: 'ລາຍລະອຽດ ສິນຄ້າ', kind: 'richtext' },
      [
        { key: 'brand', label: 'ຍີ່ຫໍ້', kind: 'text', flex: 1 },
        { key: 'model', label: 'ລຸ້ນ / ລະຫັດ', kind: 'text', flex: 1 },
      ],
      { key: 'specs', label: '📋 ຂໍ້ມູນ ເຕັກນິກ', kind: 'richtext' },
      { key: 'usage', label: '✅ ການນຳໃຊ້ ທີ່ເໝາະສົມ', kind: 'richtext' },
      { key: 'usageExamples', label: '🖼️ ຕົວຢ່າງ ການນຳໃຊ້', kind: 'richtext' },
      { key: 'installGuide', label: '🔧 ເຕັກນິກ / ຄູ່ມື ຕິດຕັ້ງ', kind: 'richtext' },
      { key: 'safetyNotes', label: '⚠️ ຄວາມປອດໄພ', kind: 'richtext' },
      [
        { key: 'price', label: '💰 ລາຄາ (ກີບ)', kind: 'money', flex: 1 },
        { key: 'unit', label: 'ຫົວໜ່ວຍ', kind: 'select', source: 'units', flex: 2 },
      ],
      [
        { key: 'stock', label: 'ສະຕັອກ', kind: 'number', flex: 1 },
        { key: 'deliveryMethods', label: '🚚 ການຈັດສົ່ງ (ຈາກຮ້ານ)', kind: 'shopDelivery', flex: 2 },
      ],
      { key: 'images', label: '🖼️ ຮູບສິນຄ້າ', kind: 'images' },
    ],
  },
  {
    key: 'status',
    label: '⚙️ ສະຖານະ / ຫຼັງບ້ານ',
    fields: [
      [
        { key: 'approved', label: 'ອະນຸມັດ', kind: 'bool' },
        { key: 'active', label: 'ເປີດຂາຍ', kind: 'bool' },
      ],
      [
        { key: 'featured', label: '📌 ສິນຄ້າເດ່ນ', kind: 'bool' },
        { key: 'quotable', label: 'ດຶງເຂົ້າ ໃບສະເໜີ', kind: 'bool' },
      ],
      [
        { key: 'costPrice', label: 'ລາຄາຕົ້ນທຶນ (ກີບ)', kind: 'money' },
        { key: 'commissionPct', label: 'ຄອມ %', kind: 'number' },
      ],
      [
        { key: 'salePrice', label: '⚡ ລາຄາ Flash (ກີບ)', kind: 'money' },
        { key: 'saleEndsAt', label: 'ໝົດ ໂປຣ ເມື່ອ', kind: 'date' },
      ],
    ],
  },
];

// Slice 2 — payment provider editor (collection paymentProviders)
export const PAYMENT_PROVIDER_GROUPS: FieldGroup[] = [
  {
    key: 'main',
    label: '🏦 ຂໍ້ມູນຫຼັກ',
    fields: [
      { key: 'name', label: 'ຊື່ ຊ່ອງທາງ', kind: 'text' },
      { key: 'type', label: 'ປະເພດ', kind: 'select', options: [
        { value: 'qr_static', label: '📷 QR ຄົງທີ່' },
        { value: 'bank_transfer', label: '🏦 ໂອນທະນາຄານ' },
        { value: 'cod', label: '💵 ເກັບເງິນປາຍທາງ' },
        { value: 'api', label: '⚡ API gateway (PhaJay — ຍັງບໍ່ເປີດ)' },
      ] },
      { key: 'instructions', label: 'ຄຳແນະນຳ ການຈ່າຍ', kind: 'textarea' },
      [
        { key: 'enabled', label: '✅ ເປີດໃຊ້', kind: 'bool' },
        { key: 'order', label: 'ລຳດັບ', kind: 'number' },
      ],
    ],
  },
  {
    key: 'account',
    label: '📷 QR & ບັນຊີ',
    fields: [
      { key: 'qrImage', label: '📷 ຮູບ QR (ຖ່າຍ / ເລືອກ — ບໍ່ແມ່ນ URL)', kind: 'avatar', aspect: [1, 1] },
      { key: 'bankName', label: 'ທະນາຄານ', kind: 'text' },
      { key: 'accountName', label: 'ຊື່ບັນຊີ', kind: 'text' },
      { key: 'accountNumber', label: 'ເລກບັນຊີ', kind: 'text' },
      [
        { key: 'minAmount', label: 'ຂັ້ນຕ່ຳ (ກີບ)', kind: 'money' },
        { key: 'maxAmount', label: 'ຂັ້ນສູງ (ກີບ)', kind: 'money' },
      ],
      { key: 'currencies', label: '💱 ສະກຸນເງິນ ທີ່ຮັບ', kind: 'multiselect', options: [
        { value: 'LAK', label: '🇱🇦 ກີບ (LAK)' },
        { value: 'THB', label: '🇹🇭 ບາດ (THB)' },
        { value: 'USD', label: '🇺🇸 ໂດລາ (USD)' },
      ] },
    ],
  },
];

// Slice 2 — logistics provider editor (collection logisticsProviders)
export const LOGISTICS_PROVIDER_GROUPS: FieldGroup[] = [
  {
    key: 'main',
    label: '🚚 ຂໍ້ມູນຫຼັກ',
    fields: [
      { key: 'name', label: 'ຊື່ ຜູ້ຂົນສົ່ງ', kind: 'text' },
      { key: 'tier', label: 'ຊັ້ນ ການສົ່ງ (layer)', kind: 'select', options: [
        { value: 'job', label: '🧰 A · ຊ່າງຖືໄປໜ້າງານ' },
        { value: 'rider', label: '🛵 B · ສົ່ງດ່ວນໃນເມືອງ' },
        { value: 'parcel', label: '📦 C · ພັດສະດຸຂ້າມແຂວງ' },
        { value: 'own', label: '🚚 D · HomeSang Express' },
      ] },
      { key: 'type', label: 'ປະເພດ', kind: 'select', options: [
        { value: 'manual', label: '✍️ Manual (ຈອງເອງ)' },
        { value: 'api', label: '⚡ API (ຍັງບໍ່ເປີດ)' },
      ] },
      { key: 'coverage', label: '📍 ພື້ນທີ່ໃຫ້ບໍລິການ', kind: 'text' },
      [
        { key: 'codSupported', label: '💵 ຮັບ COD', kind: 'bool' },
        { key: 'enabled', label: '✅ ເປີດໃຊ້', kind: 'bool' },
        { key: 'order', label: 'ລຳດັບ', kind: 'number' },
      ],
    ],
  },
  {
    key: 'fee',
    label: '💰 ຄ່າສົ່ງ & ຂໍ້ມູນ',
    fields: [
      [
        { key: 'flatFee', label: 'ຄ່າສົ່ງ ຄົງທີ່ (ກີບ)', kind: 'money' },
        { key: 'speed', label: 'ໄລຍະເວລາ', kind: 'text' },
      ],
      { key: 'deliveryRates', label: '📏 ຄ່າສົ່ງ ຕາມໄລຍະທາງ (km × ກີບ)', kind: 'distanceRates' },
      { key: 'bookingInfo', label: '📋 ວິທີ ຈອງ / ໝາຍເຫດ', kind: 'textarea' },
    ],
  },
];

export const USER_GROUPS: FieldGroup[] = [
  {
    key: 'profile',
    label: '👤 ຂໍ້ມູນຕົວ',
    fields: [
      // profile-style identity card (avatar + name + gender/dob + role/email/phone)
      { key: '__identity', label: '', kind: 'identity' },
      { key: 'bio', label: 'Bio', kind: 'textarea' },
    ],
  },
  {
    key: 'role',
    label: '🛠️ ບົດບາດ/ຜົນງານ',
    fields: [
      { key: 'group', label: '👪 ປະເພດ / ກຸ່ມ ຜູ້ໃຊ້ (ເລືອກກ່ອນ)', kind: 'select', source: 'userGroups' },
      { key: 'subTypes', label: '🛠️ ປະເພດຍ່ອຍ / ປະເພດຊ່າງ (ເລືອກໄດ້ຫຼາຍ)', kind: 'multiselect', source: 'subTypes' },
      { key: 'specialties', label: '🔧 ໝວດ ບໍລິການ ທີ່ ໃຫ້ (ຊ່າງ/ບໍລິສັດ — ເລືອກໄດ້ຫຼາຍ)', kind: 'multiselect', source: 'specialties' },
      { key: 'sellCategories', label: '🛍️ ໝວດ ສິນຄ້າ ທີ່ ຂາຍ (ຮ້ານ/ບໍລິສັດ — ເລືອກໄດ້ຫຼາຍ)', kind: 'multiselect', source: 'productCategories' },
      { key: 'status', label: 'ສະຖານະ', kind: 'select', options: [
        { value: 'approved', label: '✅ ໃຊ້ງານ' },
        { value: 'pending', label: '⏳ ລໍຖ້າ' },
        { value: 'suspended', label: '🚫 ລະງັບ' },
        { value: 'rejected', label: '❌ ປະຕິເສດ' },
      ] },
      { key: 'verified', label: '✔️ ຢືນຢັນ ຕົວ ຕົນ ຊ່າງ ແລ້ວ (ໂຊ badge + filter)', kind: 'bool' },
      [
        { key: 'rating', label: '⭐ Rating', kind: 'number' },
        { key: 'reviewCount', label: 'ຈຳນວນ review', kind: 'number' },
      ],
      { key: 'companyName', label: 'ຊື່ຮ້ານ / ບໍລິສັດ', kind: 'text' },
      // link this user to a shop/company + their role in it (owner / staff-admin)
      { key: 'shopId', label: '🏬 ຮ້ານ/ບໍລິສັດ ທີ່ ສັງກັດ (ຖ້າ ເປັນ ຮ້ານ/ບໍລິສັດ)', kind: 'select', source: 'shops' },
      { key: 'shopRole', label: '👔 ບົດບາດ ໃນ ຮ້ານ', kind: 'select', options: [
        { value: 'owner', label: '👑 ເຈົ້າຂອງ ຮ້ານ (ຈັດການ ໄດ້ ໝົດ)' },
        { value: 'admin', label: '🛠️ ແອັດມິນ ຮ້ານ (ສິນຄ້າ/ອໍເດີ · ບໍ່ ລຶບ ຮ້ານ)' },
      ] },
      { key: 'roleDescription', label: 'ຜົນງານ / ປະສົບການຜ່ານມາ', kind: 'textarea' },
      { key: 'uid', label: 'uid', kind: 'readonly' },
    ],
  },
  {
    key: 'location',
    label: '📍 ຕຳແໜ່ງ/ຮູບ',
    fields: [
      { key: 'address', label: '🏠 ທີ່ຢູ່', kind: 'text' },
      { key: 'lat', label: 'ພິກັດ', kind: 'latlng' },
      { key: 'portfolio', label: '🖼️ ຮູບປະກອບຜົນງານ (portfolio)', kind: 'images' },
    ],
  },
];
