/**
 * reference https://github.com/segmentio/is-url/blob/master/index.js
 */
/* eslint-disable no-useless-escape */
const protocolAndDomainRE = /^(?:\w+:)?\/\/(\S+)$/;
const localhostDomainRE = /^localhost[\:?\d]*(?:[^\:?\d]\S*)?$/;
const nonLocalhostDomainRE = /^[a-z0-9-]+(?:\.[a-z0-9-]{2,})+(?::\d{2,5})?(?:[/?#]\S*)?$/i;

/**
 * Removes a trailing sentence period when the remainder still matches a URL
 * 
 * @param {string} value value to strip trailing dot from
 * @returns {string} value with trailing dot removed if it was a URL
 */
const stripTrailingDot = value => {
  if (!value.endsWith('.')) return value;
  const trimmed = value.slice(0, -1);
  return localhostDomainRE.test(trimmed) || nonLocalhostDomainRE.test(trimmed)
    ? trimmed
    : value;
};

/**
 * Checks if string is a URL
 *
 * @param  {string}  value value
 * @return {Boolean} is URL
 */
const isUrl = value => {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmedValue = stripTrailingDot(value);
  const match = trimmedValue.match(protocolAndDomainRE);
  if (!match) {
    if (localhostDomainRE.test(trimmedValue) || nonLocalhostDomainRE.test(trimmedValue)) {
      return true;
    }

    return false;
  }

  const everythingAfterProtocol = match[1];
  if (!everythingAfterProtocol) {
    return false;
  }

  const trimmedAfterProtocol = stripTrailingDot(everythingAfterProtocol);
  if (
    localhostDomainRE.test(trimmedAfterProtocol) || 
    nonLocalhostDomainRE.test(trimmedAfterProtocol)
  ) {
    return true;
  }

  return false;
};

export default isUrl;
