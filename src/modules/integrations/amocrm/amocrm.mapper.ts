import { Injectable, Logger } from '@nestjs/common';
import { AmoLeadDto } from './dto/amocrm-webhook.dto';
import {
  AMO_FIELD_IDS,
  AMO_PAYMENT_MAP,
  AMO_SPECIALTY_MAP,
} from './amocrm.constants';

export interface ParsedLeadData {
  amoId: string;
  title: string;
  price: number;
  rawAddress: string | null;
  specialtyCode: string | null;
  paymentType: string | null; // Will map to Prisma enum later
  description: string | null;
  scheduledAt: string | null;
  clientName: string;
  clientPhone: string | null;
}

@Injectable()
export class AmoCrmMapper {
  private readonly logger = new Logger(AmoCrmMapper.name);

  extractLeadData(lead: AmoLeadDto): ParsedLeadData {
    return {
      amoId: lead.id,
      title: lead.name,
      price: lead.price || 0,
      rawAddress: this.getValueByFieldId(lead, AMO_FIELD_IDS.ADDRESS),
      specialtyCode: this.getMappedValue(
        lead,
        AMO_FIELD_IDS.SPECIALTY,
        AMO_SPECIALTY_MAP,
      ),
      paymentType: this.getMappedValue(
        lead,
        AMO_FIELD_IDS.PAYMENT,
        AMO_PAYMENT_MAP,
      ),
      description: this.getValueByFieldId(lead, AMO_FIELD_IDS.DESCRIPTION),
      scheduledAt: this.parseTimestamp(
        this.getValueByFieldId(lead, AMO_FIELD_IDS.TIME),
      ),
      clientName: 'Unknown (Amo)',
      clientPhone: null,
    };
  }

  mapApiResponse(apiLead: any): ParsedLeadData | null {
    if (!apiLead) return null;

    // API v4 response has 'custom_fields_values' instead of 'custom_fields'
    const customFields = apiLead.custom_fields_values || [];

    const getFieldVal = (fieldId: number): string | null => {
      const field = customFields.find((f: any) => f.field_id === fieldId);
      if (!field || !field.values || field.values.length === 0) return null;
      return field.values[0].value ? String(field.values[0].value) : null;
    };

    const getMappedVal = (
      fieldId: number,
      map: Record<number, string>,
    ): string | null => {
      const field = customFields.find((f: any) => f.field_id === fieldId);
      if (!field || !field.values || field.values.length === 0) return null;
      const valObj = field.values[0];
      const enumId = valObj.enum_id
        ? Number(valObj.enum_id)
        : valObj.enum
          ? Number(valObj.enum)
          : null;
      if (enumId && map[enumId]) return map[enumId];
      return null;
    };

    const mainContact = apiLead._embedded?.contacts?.[0] || null;
    const clientName = mainContact?.name || 'Unknown (Amo)';
    const clientPhone = this.extractPhoneFromContact(mainContact);

    this.logger.log(
      `Mapping AmoCRM lead ${apiLead.id}: contactId='${mainContact?.id ?? 'none'}', contact='${clientName}', phone='${clientPhone ?? 'null'}'`,
    );

    return {
      amoId: String(apiLead.id),
      title: apiLead.name,
      price: Number(apiLead.price) || 0,
      rawAddress: getFieldVal(AMO_FIELD_IDS.ADDRESS),
      specialtyCode: getMappedVal(AMO_FIELD_IDS.SPECIALTY, AMO_SPECIALTY_MAP),
      paymentType: getMappedVal(AMO_FIELD_IDS.PAYMENT, AMO_PAYMENT_MAP),
      description: getFieldVal(AMO_FIELD_IDS.DESCRIPTION),
      scheduledAt: this.parseTimestamp(getFieldVal(AMO_FIELD_IDS.TIME)),
      clientName,
      clientPhone,
    };
  }

  private extractPhoneFromContact(contact: any): string | null {
    if (!contact?.custom_fields_values) return null;

    const phoneField = contact.custom_fields_values.find((field: any) =>
      ['PHONE', 'MOBILE'].includes(
        String(field.field_code || '').toUpperCase(),
      ),
    );
    if (!phoneField || !phoneField.values || phoneField.values.length === 0)
      return null;
    return phoneField.values[0].value
      ? String(phoneField.values[0].value)
      : null;
  }

  private getValueByFieldId(lead: AmoLeadDto, fieldId: number): string | null {
    if (!lead.custom_fields) return null;

    const field = lead.custom_fields.find((f) => Number(f.id) === fieldId);
    if (!field || !field.values || field.values.length === 0) return null;

    // Usually values[0].value is the string we want
    return field.values[0].value ? String(field.values[0].value) : null;
  }

  private getMappedValue(
    lead: AmoLeadDto,
    fieldId: number,
    map: Record<number, string>,
  ): string | null {
    if (!lead.custom_fields) return null;

    const field = lead.custom_fields.find((f) => Number(f.id) === fieldId);
    if (!field || !field.values || field.values.length === 0) return null;

    // In AmoCRM, enums usually come as 'enum' in values[0].enum (ID) or just checks against provided map
    // The prompt says: "865179 -> 'PLUMBER'". These look like enum IDs.
    // Let's check if the raw value corresponds to any key in the map or if we need to check 'enum' property.
    // Usually for 'select' fields, the API returns the numeric ID in `enum`.

    const valueObj = field.values[0];
    const enumId = valueObj.enum ? Number(valueObj.enum) : null;

    if (enumId && map[enumId]) {
      return map[enumId];
    }

    return null;
  }

  private parseTimestamp(val: string | null): string | null {
    if (!val) return null;
    const num = Number(val);
    if (isNaN(num)) return null;

    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Yekaterinburg',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(new Date(num * 1000)).reduce(
      (acc, part) => {
        if (part.type !== 'literal') {
          acc[part.type] = part.value;
        }
        return acc;
      },
      {} as Record<string, string>,
    );

    if (
      !parts.year ||
      !parts.month ||
      !parts.day ||
      !parts.hour ||
      !parts.minute ||
      !parts.second
    ) {
      return null;
    }

    // Asia/Yekaterinburg is UTC+05:00 without DST
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000+05:00`;
  }
}
