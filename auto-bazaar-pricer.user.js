// ==UserScript==
// @name         Torn - Item Market Pricer
// @namespace    https://github.com/danielgoodwin97/torn-item-market-pricer
// @version      2.0.2
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
                 * When all pricing is finished, hide the loader and add final prices to inputs.
                 */
                complete: function () {
                    if (self.isFinished()) {
                        self.loader.hide();
                        self.applyPricesAndQuantities();
                    }
                }
            });
        },

        /**
         * Grab price inputs for inventory items.
         * @param name {string} | Item name.
         * @param id {number} | Item ID.
         */
        getInputs: function (name, id) {
            var self = this,
                item = $('[class^="itemRowWrapper___"]');

            // Rather than using IDs we now have to use item names due to the image canvas update which removed
            // the ability to grab IDs from the URLs.
            item.each(function () {
                var currentItem = $(this),
                    itemName = currentItem.find('[class^="name___"]').text();

                // Add inputs to item object.
                if (name === itemName) {
                    self.items[id].inputs = {
                        price: currentItem.find('[class^="priceInputWrapper___"] input:not([type="hidden"])'),
                        quantity: currentItem.find('[class^="amountInputWrapper___"] input:not([type="hidden"]), [class^="checkboxWrapper___"] [id*="selectCheckbox"]')
                    };
                }
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
            var self = this;

            _.each(this.items, function (value, key) {
                self.getInputs(value.name, key);

                var {price, quantity, inputs} = value,
                    {setPrices, setQuantities} = options;

                // Cannot trigger this event with jquery for some reason?
                // Has to be done in vanilla JS.
                var event = new Event('input', {
                    bubbles: true,
                    cancelable: true,
                });

                // If prices are set to be automatically added.
                if (setPrices.value) {
                    inputs.price.val(price);
                }

                // If quantities are set to be automatically added.
                if (setQuantities.value) {
                    inputs.quantity.val(quantity);

                    if (inputs.quantity.attr('type') === 'checkbox') {
                        inputs.quantity.next('label').click();
                    }
                }

                // Trigger update event.
                _.each(inputs, function (input) {
                    if (!input.length) {
                        return;
                    }

                    input[0].dispatchEvent(event);
                });
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
