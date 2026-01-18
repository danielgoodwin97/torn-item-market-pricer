// ==UserScript==
// @name         Torn - Item Market Pricer
// @namespace    https://github.com/danielgoodwin97/torn-item-market-pricer
// @version      2.1
// @description  Automatically price items in the item market.
// @author       FATU [1482556]
// @match        *.torn.com/page.php?sid=ItemMarket*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @resource     styles https://github.com/danielgoodwin97/torn-item-market-pricer/raw/master/css/styles.css
// @updateURL    https://github.com/danielgoodwin97/torn-item-market-pricer/raw/master/auto-bazaar-pricer.user.js
// @downloadURL  https://github.com/danielgoodwin97/torn-item-market-pricer/raw/master/auto-bazaar-pricer.user.js
// @supportURL   https://www.torn.com/messages.php#/p=compose&XID=1482556
// ==/UserScript==

$(() => {
    'use strict';

    // Add stylesheet.
    GM_addStyle(GM_getResourceText('styles'));

    // Defaults for script.
    var storage = 'auto-pricer',
        defaults = {
            key: {
                value: null,
                label: 'API Key',
                type: 'text'
            },
            interval: {
                value: 1000,
                label: 'Interval between API calls',
                type: 'number'
            },
            setPrices: {
                value: true,
                label: 'Automatically price items?',
                type: 'checkbox'
            },
            setQuantities: {
                value: false,
                label: 'Automatically set quantity of items?',
                type: 'checkbox'
            },
            priceModifier: {
                value: -1,
                label: 'Amount above or below market price',
                type: 'number'
            }
        },
        options = GM_getValue(storage) || defaults;

    // Configuration methods.
    var configuration = {
        /**
         * Check if configuration needs updating.
         * @returns {boolean}
         */
        shouldUpdate: function () {
            return !_.isEqual(_.sortBy(_.keys(options)), _.sortBy(_.keys(defaults)));
        },

        /**
         * Update configuration in storage.
         * @param value
         */
        update: function (value) {
            var updatedConfiguration = _.pick(_.merge(_.defaults(options, defaults), value), _.keys(defaults));

            // Update local options.
            options = updatedConfiguration;

            // Update storage options.
            GM_setValue(storage, updatedConfiguration);
        },
    };

    // Update configuration values if anything has changed with default values.
    if (configuration.shouldUpdate()) {
        configuration.update();
    }

    // Auto-pricer object.
    var pricer = {
        currentTab: null,

        // Current items.
        items: {},

        /**
         * Full page loader.
         */
        loader: {
            elements: {
                image: null,
                message: null
            },

            /**
             * Create loader element and add to page.
             */
            build: function () {
                var wrapper = $('<div class="loader-wrap"></div>'),
                    loader = $('<img src="https://i.imgur.com/u3DrfHr.gif" />'),
                    message = $('<div class="loader-message"></div>');

                // Add loader to document.
                $('body').append(wrapper);

                // Add loader elements to wrapper and hide.
                wrapper.append(loader).append(message).hide();

                // Set elements in loader object.
                this.elements.image = wrapper;
                this.elements.message = message;

                return this;
            },

            /**
             * Update loader message.
             * @param text {string} | Message to display.
             */
            update: function (text) {
                this.elements.message.text(text);

                return this;
            },

            /**
             * Show loader.
             * @returns {pricer}
             */
            show: function () {
                var {image, message} = this.elements;

                image.show();
                message.show();

                return this;
            },

            /**
             * Hide loader.
             * @returns {pricer}
             */
            hide: function () {
                var {image, message} = this.elements;

                image.hide();
                message.hide();

                return this;
            }
        },

        /**
         * Button to trigger scrape start.
         */
        buttons: {
            elements: {
                start: null,
                configure: null
            },

            /**
             * Create element and add to page.
             */
            build: function () {
                const container = $('[class^="linksContainer_"'),
                    link = $('[class^="linkContainer_"'),
                    classes = link[0].className;

                var buttons = [
                    $(`<a class="${classes} auto-pricer-configure">Configure</a>`),
                    $(`<a class="${classes} auto-pricer-start">Start FATU\'s Pricer</a>`)
                ];

                container.prepend(buttons);

                this.elements = {
                    start: buttons[1],
                    configure: buttons[0]
                };

                this.setupListeners();
            },

            /**
             * Set up button event listener.
             */
            setupListeners: function () {
                var {start, configure} = this.elements;

                start.on('click', function () {
                    pricer.gatherItems();
                });

                configure.on('click', function () {
                    pricer.popup.show();
                });
            }
        },

        /**
         * Configuration popup.
         */
        popup: {
            elements: {
                popup: null,
                background: null
            },

            /**
             * Build inputs with input information.
             */
            inputs: _.mapValues(options, function (item, key) {
                var {value, label, type} = item,
                    hasValue = !!value;

                return $(`<label>${label} <input name="${key}" type="${type}" value="${hasValue ? value : ''}" ${hasValue ? 'checked' : ''} /></label>`);
            }),

            /**
             * Create element and add to page.
             * @returns {pricer}
             */
            build: function () {
                var self = this,
                    popup = $('<div class="settings-popup"></div>'),
                    background = $('<div class="settings-popup-background"></div>');

                _.each(this.inputs, function (value, key) {
                    // Add input to popup.
                    popup.append(value);

                    // Set up listener for local storage options.
                    self.setupInputListener(key, value);
                });

                // Add popup & background to document.
                $('body').append(popup).append(background);

                // Set elements in elements object.
                this.elements.popup = popup;
                this.elements.background = background;

                // Set up dismiss popup listeners.
                this.setupDismissListener();

                return this;
            },


            /**
             * Set up dismiss listeners for popup.
             */
            setupDismissListener: function () {
                var self = this;

                this.elements.background.on('click', function () {
                    self.hide();
                });
            },

            /**
             * Set up listeners for updating configuration options in storage.
             * @param inputKey {string} | Storage key for configuration option.
             * @param input {object} | Input element.
             */
            setupInputListener: function (inputKey, input) {
                var inputElement = input.find('input');

                inputElement.on('change', function () {
                    var currentInput = $(this),
                        inputType = currentInput.attr('type'),
                        isCheckbox = inputType === 'checkbox';

                    configuration.update({
                        [inputKey]: {
                            value: isCheckbox ? currentInput.prop('checked') : currentInput.val()
                        }
                    });
                });
            },

            /**
             * Show popup.
             */
            show: function () {
                this.elements.popup.show();
                this.elements.background.show();
            },

            /**
             * Hide popup.
             */
            hide: function () {
                this.elements.popup.hide();
                this.elements.background.hide();
            }
        },

        /**
         * Update current tab.
         */
        getCurrentTab: function () {
            var currentTab = $('[class^="tabs___"]').find('[data-headlessui-state=selected]'),
                currentTabName = currentTab.attr('aria-label').replace('View ', '');

            pricer.currentTab = currentTabName !== 'All' ? currentTabName : null;
        },

        /**
         * Fetch all inventory items with pagination support.
         * @param currentTab {string|null} | Current tab filter, or null for all items.
         * @returns {Promise<Array>} | Promise resolving to array of all inventory items.
         */
        getAllInventoryItems: async function (currentTab) {
            var allItems = [],
                type = currentTab || 'All',
                start = 0,
                loaded = false;

            // Loop until the inventory is fully loaded.
            while (!loaded) {
                // Make the request.
                var response = await fetch(`/inventory.php?rfcv=${unsafeWindow.getRFC()}`, {
                    headers: {
                        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'x-requested-with': 'XMLHttpRequest'
                    },
                    body: `step=getList&type=${type}&start=${start}`,
                    method: 'POST'
                });

                // Parse the response.
                var data = await response.json();

                // Add items from this page to our collection.
                allItems = allItems.concat(data.list);

                // Check if we've loaded all items.
                loaded = data.loaded;

                // Update start position for next request.
                start = data.start;
            }

            return allItems;
        },

        /**
         * Grab all user items from API.
         */
        gatherItems: function () {
            var self = this,
                {currentTab} = self;

            // Show configuration popup when there's no API key.
            if (!options.key.value) {
                self.popup.show();

                return false;
            }

            // Show loader.
            self.loader.show();

            // Get all inventory items with pagination.
            self.getAllInventoryItems(currentTab).then(list => {
                // Loop over all items in players inventory.
                list.forEach(function (value) {
                    var {name, itemID, type, Qty, averageprice, equiped, untradable} = value,
                        isMarketable = !!parseFloat(averageprice) || !parseInt(untradable),
                        isEquipped = !!parseInt(equiped) && Qty === 1;

                    // Only add item if it's tradeable.
                    if (isMarketable && !isEquipped) {
                        self.items[itemID] = {
                            name: name,
                            quantity: Qty
                        }
                    }
                });
            }).then(() => {
                var i = 0;

                // If there are no items, stop script.
                if ($.isEmptyObject(self.items)) {
                    self.loader.hide();
                    console.log('No items were scraped. Please try again.');
                }

                self.loader.update('All items gathered.');

                _.each(pricer.items, function (value, key) {
                    setTimeout(function () {
                        self.getPrice(value.name, key);
                    }, options.interval.value * i);

                    i++;
                });
            }).catch(() => {
                self.loader.hide();
                console.log('There was an error. Please try again.');
            });
        },

        /**
         * Get cheapest possible price of a given item.
         * @param name {string} | Item name.
         * @param id {number} | Item ID.
         */
        getPrice: function (name, id) {
            var self = this;

            $.ajax({
                url: `https://api.torn.com/v2/market/${id}/itemmarket`,

                headers: {
                    Accept: 'application/json',
                    Authorization: `ApiKey ${options.key.value}`
                },

                data: {
                    limit: 1
                },

                /**
                 * Update loader message with current item being scraped.
                 */
                beforeSend: function () {
                    self.loader.update('Scraping ' + name + '.');
                },

                /**
                 * Add listing price to items object.
                 * @param data {object} | Torn API response.
                 */
                success: function (data) {
                    var { itemmarket } = data,
                        [{ price }] = itemmarket.listings || [{}];

                    // Set price to sell as a dollar lower.
                    self.items[id].price = price + parseInt(options.priceModifier.value);
                },

                /**
                 * When all pricing is finished, expand groups and add final prices to inputs.
                 */
                complete: function () {
                    if (self.isFinished()) {
                        // Expand all groups before applying prices, then hide loader.
                        self.expandAllGroups().then(function () {
                            return self.applyPricesAndQuantities();
                        }).then(function () {
                            self.loader.hide();
                        });
                    }
                }
            });
        },

        /**
         * Expand all grouped item rows by clicking .group-arrow elements.
         * Handles page re-renders by checking for remaining arrows after each click.
         * Scrolls the page to ensure virtualized elements are rendered.
         * @returns {Promise} | Resolves when all groups are expanded.
         */
        expandAllGroups: function () {
            var self = this;

            return new Promise(function (resolve) {
                function scrollAndExpand() {
                    var scrollContainer = document.documentElement,
                        scrollHeight = scrollContainer.scrollHeight,
                        currentScroll = 0,
                        scrollStep = window.innerHeight;

                    // Scroll through the entire page to render all elements.
                    function scrollNext() {
                        currentScroll += scrollStep;

                        // Update loader message.
                        self.loader.update('Scanning for item groups...');

                        if (currentScroll < scrollHeight) {
                            window.scrollTo(0, currentScroll);
                            setTimeout(scrollNext, 100);
                        } else {
                            // Scroll back to top.
                            window.scrollTo(0, 0);

                            // Now check for arrows.
                            setTimeout(expandNext, 100);
                        }
                    }

                    scrollNext();
                }

                function expandNext() {
                    // Scroll to find any arrows that might be virtualized.
                    var arrow = $('.group-arrow').first();

                    // If no more arrows, we're done.
                    if (!arrow.length) {
                        window.scrollTo(0, 0);
                        resolve();
                        return;
                    }

                    // Update loader message.
                    self.loader.update('Expanding item groups...');

                    // Scroll the arrow into view before clicking.
                    arrow[0].scrollIntoView({ behavior: 'instant', block: 'center' });

                    // Click the arrow after a brief delay.
                    setTimeout(function () {
                        arrow.click();

                        // Wait for re-render, then check again.
                        setTimeout(expandNext, 1000);
                    }, 100);
                }

                scrollAndExpand();
            });
        },

        /**
         * Check whether item scraping has finished.
         * @returns {boolean}
         */
        isFinished: function () {
            var items = this.items,
                lastItem = items[Object.keys(items)[Object.keys(items).length - 1]];

            return !!lastItem.price;
        },

        /**
         * Apply prices to price fields.
         */
        applyPricesAndQuantities: function () {
            var self = this,
                {setPrices, setQuantities} = options,
                processedElements = new WeakSet();

            /**
             * Process all currently visible item rows.
             */
            function processVisibleItems() {
                $('[class^="itemRowWrapper___"]').each(function () {
                    var currentItem = $(this),
                        element = currentItem[0];

                    // Skip if already processed.
                    if (processedElements.has(element)) {
                        return;
                    }

                    var itemName = currentItem.find('[class^="name___"]').text();

                    // Find matching item in our items list.
                    var matchedItem = _.find(self.items, function (value) {
                        return value.name === itemName;
                    });

                    if (!matchedItem) {
                        return;
                    }

                    // Mark as processed.
                    processedElements.add(element);

                    // Get the inputs.
                    var inputs = {
                        price: currentItem.find('[class^="priceInputWrapper___"] input:not([type="hidden"])'),
                        quantity: currentItem.find('[class^="amountInputWrapper___"] input:not([type="hidden"]), [class^="checkboxWrapper___"] [id*="selectCheckbox"]')
                    };

                    // Skip if no inputs found.
                    if (!inputs.price.length) {
                        return;
                    }

                    var event = new Event('input', {
                        bubbles: true,
                        cancelable: true,
                    });

                    // Apply price.
                    if (setPrices.value) {
                        inputs.price.val(matchedItem.price);
                    }

                    // Apply quantity.
                    if (setQuantities.value) {
                        inputs.quantity.val(matchedItem.quantity);

                        if (inputs.quantity.attr('type') === 'checkbox') {
                            inputs.quantity.next('label').click();
                        }
                    }

                    // Trigger update events.
                    _.each(inputs, function (input) {
                        if (input.length) {
                            input[0].dispatchEvent(event);
                        }
                    });
                });
            }

            return new Promise(function (resolve) {
                var scrollHeight = document.documentElement.scrollHeight,
                    currentScroll = 0,
                    scrollStep = window.innerHeight;

                function scrollAndProcess() {
                    // Update loader.
                    self.loader.update('Applying prices...');

                    // Process items at current scroll position.
                    processVisibleItems();

                    // Move to next scroll position.
                    currentScroll += scrollStep;

                    if (currentScroll < scrollHeight + scrollStep) {
                        window.scrollTo(0, currentScroll);
                        setTimeout(scrollAndProcess, 50);
                    } else {
                        // Done - scroll back to top.
                        window.scrollTo(0, 0);
                        resolve();
                    }
                }

                // Start from top.
                window.scrollTo(0, 0);
                setTimeout(scrollAndProcess, 50);
            });
        }
    };

    // Update current tab.
    $(document).on('click', '[class^="tabs___"] [class^="tab___"]', function () {
        var {getCurrentTab} = pricer;

        setTimeout(function () {
            pricer.items = {};
            getCurrentTab();
        }, 100);
    });

    // Run script.
    $(window).on('hashchange load', function () {
        var isAddPage = window.location.hash === '#/addListing',
            {loader, popup, buttons, getCurrentTab} = pricer;

        // Create all auto pricer elements & update current tab.
        if (isAddPage) {
            setTimeout(function () {
                getCurrentTab();
                loader.build();
                popup.build();
                buttons.build();
            }, 500);
        }
    });
});
